(function (scope) {
  "use strict";

  const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
  const DEFAULT_SETTINGS = {
    version: 2,
    destinations: [
      { name: "Social", color: "purple" },
      { name: "Media", color: "red" }
    ],
    routes: [
      { id: "social-x", pattern: "*://*.twitter.com/*", groupName: "Social", enabled: true },
      { id: "social-instagram", pattern: "*://*.instagram.com/*", groupName: "Social", enabled: true },
      { id: "social-reddit", pattern: "*://*.reddit.com/*", groupName: "Social", enabled: true },
      { id: "media-youtube", pattern: "*://*.youtube.com/*", groupName: "Media", enabled: true },
      { id: "media-spotify", pattern: "*://*.spotify.com/*", groupName: "Media", enabled: true }
    ]
  };

  function normalizeGroupName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function normalizeGroupKey(value) {
    return normalizeGroupName(value).toLowerCase();
  }

  function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }

  function compileMatchPattern(pattern) {
    const value = String(pattern || "").trim();
    if (value === "<all_urls>") return /^(?:https?|file|ftp):\/\//i;

    const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(value);
    if (!match) throw new Error("Use a Chrome match pattern, for example *://*.example.com/*");

    const [, scheme, host, path] = match;
    if (scheme === "file" && host !== "") throw new Error("File patterns cannot include a host");
    if (scheme !== "file" && !host) throw new Error("This pattern needs a host");
    if (host.includes("*") && host !== "*" && !host.startsWith("*.")) {
      throw new Error("A host wildcard must be * or start with *.");
    }
    if (host.startsWith("*.") && host.slice(2).includes("*")) {
      throw new Error("Only one host wildcard is allowed");
    }

    const schemeSource = scheme === "*" ? "https?" : escapeRegex(scheme);
    let hostSource = "";
    if (host === "*") hostSource = "[^/]+";
    else if (host.startsWith("*.")) {
      const base = escapeRegex(host.slice(2));
      hostSource = `(?:[^/.]+\\.)*${base}`;
    } else hostSource = escapeRegex(host);

    const pathSource = escapeRegex(path).replace(/\*/g, ".*");
    return new RegExp(`^${schemeSource}:\\/\\/${hostSource}${pathSource}$`, "i");
  }

  function matchesPattern(pattern, url) {
    try {
      return compileMatchPattern(pattern).test(url);
    } catch {
      return false;
    }
  }

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const routes = Array.isArray(source.routes) ? source.routes : DEFAULT_SETTINGS.routes;
    const destinations = [];
    const destinationKeys = new Set();

    function addDestination(name, color) {
      const normalizedName = normalizeGroupName(name);
      const key = normalizeGroupKey(normalizedName);
      if (!key || destinationKeys.has(key)) return;
      destinationKeys.add(key);
      destinations.push({ name: normalizedName, color: COLORS.includes(color) ? color : "grey" });
    }

    if (Array.isArray(source.destinations)) {
      source.destinations.forEach((destination) => {
        if (destination && typeof destination === "object") addDestination(destination.name, destination.color);
      });
    }

    const normalizedRoutes = routes.map((route, index) => {
      const groupName = normalizeGroupName(route?.groupName);
      // Legacy settings kept color on every route. First route wins on a conflict.
      addDestination(groupName, route?.color);
      const destination = destinations.find((item) => normalizeGroupKey(item.name) === normalizeGroupKey(groupName));
      return {
        id: String(route?.id || `route-${index}-${Date.now()}`),
        pattern: String(route?.pattern || "").trim(),
        groupName: destination?.name || groupName,
        enabled: route?.enabled !== false
      };
    }).filter((route) => route.pattern && route.groupName);

    return {
      version: 2,
      destinations,
      routes: normalizedRoutes
    };
  }

  function destinationForName(destinations, name) {
    const key = normalizeGroupKey(name);
    return (destinations || []).find((destination) => normalizeGroupKey(destination.name) === key);
  }

  scope.AirTraffic = {
    COLORS, DEFAULT_SETTINGS, compileMatchPattern, matchesPattern, normalizeSettings,
    normalizeGroupName, normalizeGroupKey, destinationForName
  };
})(typeof self !== "undefined" ? self : window);

"use strict";

importScripts("shared.js");

const {
  DEFAULT_SETTINGS, destinationForName, matchesPattern, normalizeGroupKey, normalizeSettings
} = AirTraffic;
const destinationQueues = new Map();
const routingTabs = new Set();

async function readSettings() {
  const stored = await chrome.storage.local.get("settings");
  return normalizeSettings(stored.settings || DEFAULT_SETTINGS);
}

function routeForUrl(settings, url) {
  const route = settings.routes.find((item) => item.enabled && matchesPattern(item.pattern, url));
  if (!route) return null;
  return { route, destination: destinationForName(settings.destinations, route.groupName) };
}

async function existingGroup(windowId, groupName) {
  const groups = await chrome.tabGroups.query({ windowId });
  const key = normalizeGroupKey(groupName);
  return groups.find((group) => normalizeGroupKey(group.title) === key);
}

function queueForDestination(windowId, groupName, operation) {
  const key = `${windowId}\u0000${groupName}`;
  const previous = destinationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  destinationQueues.set(key, next);
  const cleanUp = () => {
    if (destinationQueues.get(key) === next) destinationQueues.delete(key);
  };
  next.then(cleanUp, cleanUp);
  return next;
}

async function placeTab(tab, route, destination) {
  const groupName = destination?.name || route.groupName;
  const color = destination?.color || "grey";
  return queueForDestination(tab.windowId, normalizeGroupKey(groupName), async () => {
    const currentTab = await chrome.tabs.get(tab.id);
    if (currentTab.pinned || !currentTab.url) return;

    let group = await existingGroup(currentTab.windowId, groupName);
    if (group) {
      if (currentTab.groupId !== group.id) {
        await chrome.tabs.group({ tabIds: currentTab.id, groupId: group.id });
      }
      if (group.color !== color || group.title !== groupName) {
        await chrome.tabGroups.update(group.id, { title: groupName, color });
      }
      return;
    }

    const groupId = await chrome.tabs.group({
      tabIds: currentTab.id,
      createProperties: { windowId: currentTab.windowId }
    });
    await chrome.tabGroups.update(groupId, { title: groupName, color });
  });
}

async function routeTab(tabOrId, settings) {
  const tab = typeof tabOrId === "number" ? await chrome.tabs.get(tabOrId) : tabOrId;
  if (!tab || !tab.id || tab.pinned || !tab.url || routingTabs.has(tab.id)) return;

  routingTabs.add(tab.id);
  try {
    const selected = routeForUrl(settings, tab.url);
    if (selected) {
      await placeTab(tab, selected.route, selected.destination);
    } else if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      const currentGroup = await chrome.tabGroups.get(tab.groupId);
      const managedNames = new Set(
        settings.routes.filter((route) => route.enabled).map((route) => normalizeGroupKey(route.groupName))
      );
      if (managedNames.has(normalizeGroupKey(currentGroup.title))) await chrome.tabs.ungroup(tab.id);
    }
  } catch (error) {
    // Tabs can disappear or move while asynchronous grouping is underway.
    console.debug("Air Traffic Control skipped a tab:", error?.message || error);
  } finally {
    routingTabs.delete(tab.id);
  }
}

async function routeAllTabs() {
  const settings = await readSettings();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) await routeTab(tab, settings);
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await routeAllTabs();
});

chrome.runtime.onStartup.addListener(routeAllTabs);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  readSettings().then((settings) => routeTab(tab, settings));
});

chrome.tabs.onCreated.addListener((tab) => {
  readSettings().then((settings) => routeTab(tab, settings));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.settings) routeAllTabs();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

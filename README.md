# Air Traffic Control

<p align="center">
  <img src="icons/icon128.png" alt="Air Traffic Control icon" width="128">
</p>

A dependency-free Manifest V3 extension that sends websites to named Chromium tab groups. Routes are checked from top to bottom, and the first match wins. Choose an open group from the searchable destination picker, or create a destination name that becomes a tab group on the first matching navigation.

The included examples send Twitter/X, Instagram, and Reddit to **Social**, and YouTube and Spotify to **Media**.

## Install in Chromium

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project folder.
5. Click the extension's toolbar button to open Air Traffic Control.

No build step or dependencies are required. After changing source files, choose **Reload** on the extensions page.

## Test a route

1. Keep the example routes and save them.
2. Open `https://www.reddit.com/` in a normal, unpinned tab.
3. Confirm the tab moves into a purple group named **Social** in that window.
4. Open YouTube and confirm it moves into a separate red **Media** group.
5. Navigate a tab inside **Social** to a site that does not match an enabled route. Confirm that tab leaves the group.

The options page presents common routes as domains. Choose **URL matches** when you need a full [Chrome match pattern](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), such as `*://*.example.com/*`.

Pinned tabs and internal browser pages are not routed. When a new or navigated tab inside an enabled route destination no longer matches any route, it is removed from that group. Groups not named by an enabled route remain untouched.

## Implementation notes

- Group names ignore case and repeated whitespace when matching, so every route to the same normalized destination shares one automatic color.
- Legacy per-route colors are reconciled in route order: the first route targeting a destination supplies its color.
- Destination operations are queued to prevent simultaneous tabs from creating duplicate groups.
- The service worker reacts only to tab creation and URL changes, not to its own group changes, preventing loops.
- Options are stored locally with `chrome.storage.local`.

## Reference and license

Behavioral ideas were informed by [loilo/auto-group-tabs](https://github.com/loilo/auto-group-tabs), an MIT-licensed project. This extension is a separate implementation with its own interface and data model.

Released under the [MIT License](LICENSE).

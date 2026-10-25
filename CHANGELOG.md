# ThreadPress 0.6.0

Found and fixed by new automated stress testing (54,000 random exports in Chrome, Firefox and Safari's engine, plus scale, attack and scrolling stress tests):

- Long chats on slow sites or connections are now exported in full. Before, if older messages took more than about a second to load, only the newest part of the chat was exported.
- Very long chats on sites that draw messages late now keep every message in the right order (one message could be lost and the order scrambled).
- Exporting while a reply is still being written no longer keeps waiting.
- Security: chat titles can no longer disguise an exported file's real type with invisible characters.
- Grok: lists, code and tables in your own messages are no longer dropped.
- The floating button's hide (×) no longer moves away as you reach for it.

Update: download **ThreadPress-extension.zip** below, extract it over your ThreadPress folder, and click the reload arrow on the extensions page.

# upstream-main 미반영 커밋 목록

`main`에 반영되지 않은 `upstream-main`(mattermost/mattermost-plugin-boards) 커밋 목록 (오래된 순).
`/speckit-sync` 스킬이 이 목록을 갱신·소비한다. 반영 완료된 커밋은 목록에서 제거된다.

- 갱신일: 2026-10-15 14:33
- 기준: `git log main..upstream-main` − 처리 완료(cherry-pick/adapt 커밋 본문의 upstream 참조, 하단 부록의 제외·spec 전환)
- 남은 커밋: 66개

**마지막 반영 커밋:** `d5ed8fba` | [Update minimum server version to 10.7.0 (#150)](https://github.com/mattermost/mattermost-plugin-boards/commit/d5ed8fba954453d9bcf84ed4e8e6f1d01946397f) | 2025-12-05

| 커밋 해시 | 커밋 제목 | 커밋 일자 |
|---|---|---|
| 57c5be5b | [Validation to modify comments (#152)](https://github.com/mattermost/mattermost-plugin-boards/commit/57c5be5b6ef59d02dd72e35094d1fae8ba6e9619) | 2026-01-08 |
| e3ef71cd | [Upgraded board version to v9.2.2 (#156)](https://github.com/mattermost/mattermost-plugin-boards/commit/e3ef71cd47fdef0ffee837f950e368da7f9aa1fc) | 2026-01-09 |
| de9848b7 | [Updated mattermost/server/public/model version to v0.1.21 in boards (#158)](https://github.com/mattermost/mattermost-plugin-boards/commit/de9848b7e0348d97a550b170d1b2108a73b222b9) | 2026-01-27 |
| ea1b9d8a | [Fix: Viewer Role can Accessing Individual Cards if part of board (#162)](https://github.com/mattermost/mattermost-plugin-boards/commit/ea1b9d8a7885cde01f2b59b51e2efdeb676f0323) | 2026-02-03 |
| 0b831571 | [Fix: Filter not working correctly for text fields in Boards (#160)](https://github.com/mattermost/mattermost-plugin-boards/commit/0b831571dc4adae2135fecbc1f2e1d0386765223) | 2026-02-03 |
| 3aeb6caf | [workflows: adjust token permissions (#168)](https://github.com/mattermost/mattermost-plugin-boards/commit/3aeb6caf2405576205d89e1270e234cb92dda4f6) | 2026-02-09 |
| b69e037a | [Board blank page if no team id is present in localstorage (#165)](https://github.com/mattermost/mattermost-plugin-boards/commit/b69e037a200394adcdc50330e178eedf0824f003) | 2026-02-10 |
| 006f9cb5 | [Fixed critical bugs in Mattermost Boards plugin (#169)](https://github.com/mattermost/mattermost-plugin-boards/commit/006f9cb52728947d1ce5a6e8b275ca2dd5d80178) | 2026-02-14 |
| 4e1bd533 | [Use webapp exported markdown to card and board descriptions (#170)](https://github.com/mattermost/mattermost-plugin-boards/commit/4e1bd5333e460236f368a9824987814b46248445) | 2026-02-14 |
| 7027d651 | [Instead of manually updating the version, reason from plugin.json (#164)](https://github.com/mattermost/mattermost-plugin-boards/commit/7027d6519745b6420b318b193880d98ac324853d) | 2026-02-17 |
| bc671466 | [New page access denied page instead of something went wrong  (#166)](https://github.com/mattermost/mattermost-plugin-boards/commit/bc671466a184e0e28c47bf8f9a32d39bcd60fe03) | 2026-02-18 |
| bbcdd46c | [Fix bot notification board link (#178)](https://github.com/mattermost/mattermost-plugin-boards/commit/bbcdd46c1eb690cf9738c1525dc6e14df1f92728) | 2026-03-21 |
| 7d47a116 | [Fix: Board infinity redirect multiperson property (#176)](https://github.com/mattermost/mattermost-plugin-boards/commit/7d47a1163e616887a921dbed1b19ecea53fa563d) | 2026-03-21 |
| b27eb87b | [Validate file ownership before associating with a block (#179)](https://github.com/mattermost/mattermost-plugin-boards/commit/b27eb87b24c46e13ff4a759efb12fa80a0493e75) | 2026-03-27 |
| b87f32e5 | [Fix the infinite redirect loop for boards (#177)](https://github.com/mattermost/mattermost-plugin-boards/commit/b87f32e57fb7db951162d30dcfb1afaa07e98c92) | 2026-03-31 |
| 9d589237 | [Fix Server test for boards (#155)](https://github.com/mattermost/mattermost-plugin-boards/commit/9d58923771bd2ea91b45e810915a4b1a463af9d4) | 2026-04-16 |
| 5bc26a2e | [feat(workflow): pr test analysis (#187)](https://github.com/mattermost/mattermost-plugin-boards/commit/5bc26a2e16b2d7fb3b8de4836406a56e45859632) | 2026-04-17 |
| d139ef29 | [E2E test setup for boards (#185)](https://github.com/mattermost/mattermost-plugin-boards/commit/d139ef292caf0670d966eb0937e7d8c35d60c72e) | 2026-04-23 |
| eb61ee2a | [MM-67913: stop managing app__body in MainApp (#188)](https://github.com/mattermost/mattermost-plugin-boards/commit/eb61ee2a243fb06b269a05c79d7633f161adacb0) | 2026-04-29 |
| 7b0a3d17 | [Translation: Add Korean (ko) language support and update translations (#154)](https://github.com/mattermost/mattermost-plugin-boards/commit/7b0a3d17242b51f77836f5ddfdd59679ba683c9d) | 2026-05-07 |
| 3bb2b91a | [Add cursor.md, agent-browser for Cursor Cloud dev env (#193)](https://github.com/mattermost/mattermost-plugin-boards/commit/3bb2b91a9126d2f4ae481732df5887ae71fe8778) | 2026-05-13 |
| 9229fd28 | [Add Cursor cloud agent environment (#195)](https://github.com/mattermost/mattermost-plugin-boards/commit/9229fd281f022c9139a8b44a288310d1e7e41c91) | 2026-05-27 |
| 6bf168b7 | [Update minimum server version (#201)](https://github.com/mattermost/mattermost-plugin-boards/commit/6bf168b7c5634cac3eeda1746284a43631abd7f8) | 2026-06-01 |
| 05a54f1c | [Fix issue: showing error when deleting the board (#189)](https://github.com/mattermost/mattermost-plugin-boards/commit/05a54f1c98dc9e8f4fbc56d11b5684bf9fe69c5b) | 2026-06-02 |
| 2218645f | [Use Mattermost 11.8 image for e2e tests (#202)](https://github.com/mattermost/mattermost-plugin-boards/commit/2218645ff921c2ed894fc1325dcda3554de635d4) | 2026-06-01 |
| 2852181f | [MM-68843: Validate channel read access when linking boards to channels (#199)](https://github.com/mattermost/mattermost-plugin-boards/commit/2852181fece8b9fdef8f54c8b7ee2b893a6f0fce) | 2026-06-12 |
| 09b02178 | [MM-68841: Strip SchemeAdmin when adding guest board members (#198)](https://github.com/mattermost/mattermost-plugin-boards/commit/09b02178b73554083a9ab5fa2c73bf0363fb1baa) | 2026-06-12 |
| 516223b1 | [\[MM-69023\] Validate board member role bits on the server side (#207)](https://github.com/mattermost/mattermost-plugin-boards/commit/516223b19804e46dbf20f2205d93b127a8719fcc) | 2026-06-17 |
| 27a13cf9 | [Bump minimum server version to 11.9.0 (#208)](https://github.com/mattermost/mattermost-plugin-boards/commit/27a13cf9234ed0277fc55750d32991baf63c7a4b) | 2026-06-17 |
| 5880c137 | [Add FIPS build support for Linux/amd64 plugin releases (#210)](https://github.com/mattermost/mattermost-plugin-boards/commit/5880c13761be1e01b653102eed060d6fc8f62310) | 2026-06-17 |
| 7eea2ac4 | [\[MM-69067\] Revoke Board Admin from users demoted to System Guest (#212)](https://github.com/mattermost/mattermost-plugin-boards/commit/7eea2ac416ed15f05e4edba3638688fdc3dbcc07) | 2026-06-22 |
| c5c7ee17 | [\[MM-69048\] Validate WebSocket command field types to prevent plugin crash (#211)](https://github.com/mattermost/mattermost-plugin-boards/commit/c5c7ee17fc6b5cca589c0d04a3202a3f7c9b62cc) | 2026-06-22 |
| c7365fb4 | [MM-69032: gate channelId mutations behind PermissionManageBoardRoles … (#209)](https://github.com/mattermost/mattermost-plugin-boards/commit/c7365fb4463a778546c64bd637fb29296d9e12f2) | 2026-06-22 |
| fcf6aa49 | [fix failing test on main (#215)](https://github.com/mattermost/mattermost-plugin-boards/commit/fcf6aa49d6b32a6844ebd96c4a45c755f3e2ee62) | 2026-06-23 |
| d4543276 | [MM-69280: Filter undefined blocks before sorting updated time/by properties (#213)](https://github.com/mattermost/mattermost-plugin-boards/commit/d4543276476b7fa6ff8ab57773746861a42e183d) | 2026-06-23 |
| 162e5a59 | [\[MM-69594\] Write resolved manifest (with version) into bundled plugin.json (#217)](https://github.com/mattermost/mattermost-plugin-boards/commit/162e5a59d50048b7a03a824e68c54175c4fc551b) | 2026-07-01 |
| 95b8541e | [MM-69521: prevent Boards notification worker panic from malformed block properties (#216)](https://github.com/mattermost/mattermost-plugin-boards/commit/95b8541e6d0008523ef389e4d76898c92e8a57b5) | 2026-07-02 |
| ab5935a1 | [\[MM-69603\] Enforce board creation permissions on archive import (#219)](https://github.com/mattermost/mattermost-plugin-boards/commit/ab5935a144c45915ecd1c27143a412c2e2dc8791) | 2026-07-08 |
| a807c9e6 | [\[MM-69606\] Limit decompressed size on archive import (#220)](https://github.com/mattermost/mattermost-plugin-boards/commit/a807c9e67f7645a144855a2b4372ed32015defef) | 2026-07-13 |
| 261bc51c | [MM-69622 Refactoring board validators (#224)](https://github.com/mattermost/mattermost-plugin-boards/commit/261bc51cc98f400971f303394eba21bd07c4f015) | 2026-07-16 |
| 9c099baa | [MM-63792: allow duplicating boards with empty file/attachment blocks (#238)](https://github.com/mattermost/mattermost-plugin-boards/commit/9c099baa9f377858b0f069a9a32ab08622417b3c) | 2026-07-22 |
| 1b13eca7 | [MM-69978: strengthen validation of card property data (#243)](https://github.com/mattermost/mattermost-plugin-boards/commit/1b13eca7916c6553bb3f12f3c2bf3d7d318b87ea) | 2026-08-04 |
| 8cf5a989 | [MM-67542: stop leaking the server subpath in Boards Desktop navigation (#244)](https://github.com/mattermost/mattermost-plugin-boards/commit/8cf5a9891f0864acf8762422c1914f221c94c21f) | 2026-08-11 |
| 4b7dd4b4 | [MM-64344: fix intermittent LHS board drag-and-drop ordering (#246)](https://github.com/mattermost/mattermost-plugin-boards/commit/4b7dd4b41a73bd70efbdb3406ad5f665d62cfd69) | 2026-08-17 |
| 2f692a9e | [M-70411 Addressing attachment validation mismatch (#247)](https://github.com/mattermost/mattermost-plugin-boards/commit/2f692a9e059f8d254e58b6d5bad7545a739cab48) | 2026-08-27 |
| 11829283 | [Migrate Boards plugin to React 19 (#254)](https://github.com/mattermost/mattermost-plugin-boards/commit/11829283ab61115ca5e85812195d280e31e0ca2a) | 2026-09-17 |
| 05efecfd | [MM-70856: Update webapp lodash dependency (#255)](https://github.com/mattermost/mattermost-plugin-boards/commit/05efecfd53f9f8fc535c871b805ed59ab5c93f58) | 2026-09-23 |
| c7b30d03 | [Count releases from the last release tag, not the last tag (#259)](https://github.com/mattermost/mattermost-plugin-boards/commit/c7b30d03c1b8544eb4481bb7ef528857bc29dc4a) | 2026-09-24 |
| a04a2a23 | [\[MM-58423\] Fix unreadable focused emoji in Boards emoji autocomplete on dark themes (#260)](https://github.com/mattermost/mattermost-plugin-boards/commit/a04a2a230e206b828ca81ba6fe83c41db9a5fdbd) | 2026-10-07 |
| dee23bdd | [MM-69061: Fix Find Boards search crashing on boards from unknown teams (#261)](https://github.com/mattermost/mattermost-plugin-boards/commit/dee23bddbeb85277f8d4265c386f07708eb11e54) | 2026-10-07 |
| 4098a144 | [\[MM-58101\] Fix dark-theme emoji suggestion popup being unreadable in Boards (#262)](https://github.com/mattermost/mattermost-plugin-boards/commit/4098a144531d27e0b1fb2cf67de479b324c2293b) | 2026-10-07 |
| 1a9b774e | [\[MM-58099\] Fix truncated Boards filter values and add tooltips (#264)](https://github.com/mattermost/mattermost-plugin-boards/commit/1a9b774e39662e78bc4f0958348789a7248d7f72) | 2026-10-07 |
| 0a6b4eb4 | [\[MM-62104\] Fix boards leaving custom category after switching teams (#265)](https://github.com/mattermost/mattermost-plugin-boards/commit/0a6b4eb447a517c3243fa5a95fbf7c6e928444a3) | 2026-10-07 |
| f4d9eaa9 | [\[MM-58332\] Stop logging "access denied to templates" for guest users (#267)](https://github.com/mattermost/mattermost-plugin-boards/commit/f4d9eaa94e4e35b26aaae296ca329e8193a61e97) | 2026-10-07 |
| ee80c84a | [MM-68337: fix Boards share link opening the last-visited board (#270)](https://github.com/mattermost/mattermost-plugin-boards/commit/ee80c84aa2aa56df81cfbddb777bc4ec82fb6e49) | 2026-10-07 |
| 020b92a2 | [\[MM-58424\] Show access denied page for links to private boards (#271)](https://github.com/mattermost/mattermost-plugin-boards/commit/020b92a293d6b39abc90e80c98a759faf957f2c1) | 2026-10-07 |
| 6ffbf713 | [\[MM-58730\] Show 'Board not found' for deleted board links (#263)](https://github.com/mattermost/mattermost-plugin-boards/commit/6ffbf713e40ebc88e320baba2fbbf25043d3828e) | 2026-10-07 |
| aea39fd1 | [MM-69658: preserve query string and hash on Boards router initial sync (#272)](https://github.com/mattermost/mattermost-plugin-boards/commit/aea39fd116bc931d0ed82df00d82f7947f047ef5) | 2026-10-12 |
| 75cce8da | [\[MM-69046\] Authorize sourceBoardID and file ownership on the Boards block-copy path (#268)](https://github.com/mattermost/mattermost-plugin-boards/commit/75cce8da041a36e3373c79459bff1a34340501dc) | 2026-10-12 |
| a2dde63d | [\[MM-58100\] Fix Boards filter dialog adding "(unknown)" rows past available properties (#266)](https://github.com/mattermost/mattermost-plugin-boards/commit/a2dde63d3af0ebe9aceb166c7c6ae03531ff5a6e) | 2026-10-12 |
| 5e6773d0 | [\[MM-66101\] Fix undone board becoming inaccessible and leaving its category (#279)](https://github.com/mattermost/mattermost-plugin-boards/commit/5e6773d019d71cc243e6a516a53002839fc0b459) | 2026-10-13 |
| 00d874f5 | [\[MM-69840\] Fix flaky Boards server-test caused by async change-notification callbacks (#277)](https://github.com/mattermost/mattermost-plugin-boards/commit/00d874f54ef497d0765c8f1790bc2ba35bd1d8fc) | 2026-10-13 |
| 58c31e94 | [\[MM-64484\] Show feedback and loading state when importing a board archive (#274)](https://github.com/mattermost/mattermost-plugin-boards/commit/58c31e94260a2c1bc7a1d5594f40d45ca6fe122b) | 2026-10-13 |
| 4b5c06f8 | [\[MM-68947\] Retry transient getMe/getTeam failures to stop spurious Boards error page (#273)](https://github.com/mattermost/mattermost-plugin-boards/commit/4b5c06f8d448335dbca77971441405a5f8a6f11f) | 2026-10-13 |
| 451e81be | [\[MM-58098\] Fix Boards RHS header truncating group message usernames (#278)](https://github.com/mattermost/mattermost-plugin-boards/commit/451e81be50ea42dfeb8da7e3df9ac46741dd4542) | 2026-10-13 |
| abc9876a | [\[MM-66557\] Migrate block attachmentId to fileId and remove legacy field support (#276)](https://github.com/mattermost/mattermost-plugin-boards/commit/abc9876afc9b375d29c09642fcfc2a195ae80ddd) | 2026-10-14 |

## 제외된 커밋

| 커밋 해시 | 커밋 제목 | 사유 |
|---|---|---|

## spec 전환 커밋

| 커밋 해시 | 커밋 제목 | spec |
|---|---|---|

# Contract: 개인 뷰 읽기 · 방송 필터

**Spec**: [spec.md](../spec.md) | FR-010, FR-012~FR-014, FR-027, FR-028

## 판정 하나

```
ViewHiddenFrom(block, userID) = block.type == "view"
                              && ViewAccessModeOf(block) == private
                              && block.createdBy != userID
```

`userID`가 빈 문자열(공유 링크 읽기 토큰)이면 만든 사람이 아니므로 모든 개인 뷰가 숨는다.

## 적용 자리

| # | 자리 | 동작 | 덮는 경로 |
|---|---|---|---|
| F1 | `App.FilterBlocksForUser` — 보드를 읽은 직후, evaluator 생성 전 | `ViewHiddenFrom`인 블록 제거 | `GET /blocks?all=true`, `GET /blocks?block_id=`, `GET /blocks?parent_id=&type=`, 내보내기 아카이브 |
| F2 | `App.FilterBlockRecipients` — 보드를 읽은 직후, settings 조기 반환 전 | 블록이 private 뷰면 `userIDs ∩ {createdBy}` | 블록 변경 · 삭제 websocket 방송 전부 |
| F3 | `sqlstore.duplicateBoard` — 댓글을 거르는 루프 | `ViewHiddenFrom(b, userID)`인 뷰 제거 | 보드 복제, 템플릿에서 보드 만들기 |
| F4 | webapp `store/views.ts` 목록 셀렉터 | `isViewHiddenFrom(view, me.id)` 제거 | 탭 · 사이드바 · 리다이렉트 (방어) |

F1 · F2는 **카드 접근 규칙이 꺼진 보드에서도** 돌아야 하므로 기존 조기 반환보다 앞에
둔다. F1은 뷰 블록만 건드린다 — 카드 · 댓글 · 본문은 지금 판정 그대로다.

## 공용 → 개인 전환 방송

```
patch 전 mode != private, patch 후 mode == private 인 뷰 블록에 대해:
    BroadcastBlockChange(team, block)                         // F2가 만든 사람에게만 전달
    BroadcastBlockDeleteExcept(team, block.id, board.id, block.createdBy)
                                                             // ID만 담은 tombstone을 나머지에게
```

`BroadcastBlockDeleteExcept`는 ws `Adapter` 인터페이스에 새로 들어간다. 구현은
`getUserIDsForTeamAndBoard` 결과에서 제외 대상을 빼고 `sendUserMessageSkipCluster`로
보낸다. 클러스터로는 `ClusterMessage{..., ExcludeUsers}`로 전달하고 받는 노드는 같은 제외를
적용한다.

tombstone의 모양은 기존 `BroadcastBlockDelete`와 같다: `{id, boardId, updateAt, deleteAt}`.
내용(`fields` · `title` · `createdBy`)은 싣지 않는다.

## 개인 → 공용 전환 방송

추가 처리 없음. `BroadcastBlockChange`가 모두에게 가고(F2가 private이 아니라 통과) webapp은
새 뷰처럼 추가한다.

## 개인 뷰 삭제 방송

- 만든 사람이 지울 때: `deletedBlockMessage(block)`이 전체 블록을 실으므로 F2가 만든
  사람에게만 전달한다. 다른 사용자는 애초에 뷰가 없으니 받을 필요가 없다.
- 관리자가 정리 경로로 지울 때: 같다. 만든 사람의 탭에서 사라진다.

## 계약 검증 케이스

| ID | 상황 | 기대 | FR |
|---|---|---|---|
| F-01 | B가 `?all=true`로 보드 블록 조회, A의 개인 뷰 포함 | 응답에 그 뷰 없음, 카드는 그대로 | FR-010 |
| F-02 | B가 `?block_id=<A의 개인 뷰>` 조회 | 빈 배열 | FR-010·014 |
| F-03 | A(만든 사람)가 `?all=true` 조회 | 개인 뷰 포함 | FR-010 |
| F-04 | 관리자(만든 사람 아님)가 `?all=true` 조회 | 개인 뷰 없음 | FR-012 |
| F-05 | 카드 접근 규칙이 꺼진 보드에서 F-01 | 같은 결과 | FR-010 |
| F-06 | A가 자기 개인 뷰를 patch → 방송 수신자 | A만 | FR-010 |
| F-07 | A가 공용 뷰를 개인으로 전환 | A는 갱신 블록 수신, B·C는 ID만 담은 tombstone 수신 | FR-013 |
| F-08 | 클러스터 다른 노드에서 F-07 메시지 재진입 | 같은 수신자 결과 | FR-013 |
| F-09 | A가 개인 뷰를 공용으로 되돌림 | B·C가 전체 블록 수신 | FR-010 |
| F-10 | B가 A의 개인 뷰가 있는 보드를 복제 | 사본에 그 뷰 없음, B 자신의 개인 뷰는 있음 | FR-027 |
| F-11 | 관리자가 A의 개인 뷰가 있는 보드를 내보내기 | 아카이브에 그 뷰 없음 | FR-028 |
| F-12 | 공용 · 관리자 뷰가 있는 보드를 복제 | 사본 뷰의 accessMode 보존 | FR-027 |
| F-13 | webapp 스토어에 A의 개인 뷰가 있고 me가 B | `getCurrentBoardViews`에 없음 | FR-010 |
| F-14 | 카드 · 댓글 블록 | F1이 건드리지 않음 — 기존 009 테스트 그대로 통과 | FR-018 |

# 종단 검증 가이드: 뷰마다 권한 모드를 정한다

구현 완료 후 이 시나리오를 실제 화면과 API로 확인하고 결과를 완료 근거로 제시한다
(constitution 원칙 I). 계약 케이스 ID(G · F · A · W)는 `contracts/`를 가리킨다.

## 사전 준비

```bash
# 기준선 채취 (구현 전에 한 번) — 실패 목록을 baseline.md에 남긴다
make server-test 2>&1 | grep -E "^(--- FAIL|FAIL)" | sort > /tmp/022-server-baseline.txt
cd webapp && npm run test 2>&1 | grep -E "^(FAIL|●)" | sort > /tmp/022-webapp-baseline.txt
npm run check-types 2>&1 | grep -c "error TS"
cd ..

# 자동 빌드·배포 (켜져 있지 않으면)
cd webapp && setsid env MM_DEBUG=1 nohup npm run debug:watch > /tmp/boards-watch.log 2>&1 < /dev/null &
cd ..
# 서버 변경은 플러그인 재배포가 필요하다 — watch가 서버도 다시 올리는지 로그로 확인하고,
# 아니면 make deploy. 배포 뒤 브라우저 하드 리프레시.
```

- Mattermost: `http://localhost:8065`
- 계정 3개: **관리자 A**(보드 관리자), **팀원 B**(editor), **팀원 C**(editor). 없으면
  `qa-account-via-local-mode` 메모 절차로 만든다.
- 보드 하나에 공용 뷰 2개 이상(기본 "Board view" + 표 뷰 하나). 카드 몇 장.
- 브라우저 창 3개를 나란히(A · B · C). playwright MCP를 쓰면 탭 3개로 대신한다.
- 직접 API 호출은 `boards-api-repro-recipe` 메모대로 `X-Requested-With: XMLHttpRequest`
  헤더와 세션 쿠키를 붙인다.

## 시나리오 1: 관리자 모드 잠금 (US1 · US5 / SC-001 · SC-002)

1. A 창에서 표 뷰의 권한 메뉴(정렬 뒤)를 연다. **기대**: 공용 · 관리자 항목이 보인다
   (A가 만든 뷰면 개인도). 관리자를 고른다. 버튼 라벨이 "관리자"로 바뀐다.
2. B 창을 본다(새로고침 없이). **기대**: 속성 · 그룹화 · 필터 · 정렬 버튼이 비활성이고,
   마우스를 올리면 "이 뷰는 관리자만 수정할 수 있습니다"가 뜬다. 권한 버튼도 "관리자"
   라벨로 비활성이다. (U-01 · U-02, W-08)
3. B 창에서 활성 탭을 다시 클릭해 탭 메뉴를 연다. **기대**: 이름 바꾸기 · 뷰 삭제가 없고
   뷰 복제만 있다. (U-05~U-07)
4. B 창에서 카드를 다른 열(칸반) 또는 다른 행 위치(표)로 끈다. **기대**: 성공. 서버 거절
   플래시가 없다. (U-09, G-06)
5. B 창에서 새 카드 메뉴 → 템플릿 옆 옵션 → "기본으로 지정". **기대**: 비활성. (U-08)
6. B 세션으로 직접 patch를 보낸다:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
     -H "X-Requested-With: XMLHttpRequest" -b "$B_COOKIE" -H "Content-Type: application/json" \
     "http://localhost:8065/plugins/focalboard/api/v2/boards/$BOARD/blocks/$VIEW" \
     -d '{"updatedFields":{"sortOptions":[]}}'
   ```
   **기대**: `403`. (G-03) 같은 요청에서 본문을 `{"updatedFields":{"cardOrder":[]}}`로 바꾸면
   `200`. (G-06) 본문에 `cardOrder`와 `sortOptions`를 함께 넣으면 `403`. (G-07)
7. B 세션으로 `{"updatedFields":{"accessMode":"everyone"}}`. **기대**: `403`. (G-09)
8. A 창에서 필터를 하나 건다. **기대**: 성공하고 B · C 창에 반영된다. (G-08)
9. A 창에서 권한을 공용으로 되돌린다. **기대**: B 창 메뉴가 다시 활성. (US2-3)

## 시나리오 2: 기존 뷰는 달라지지 않는다 (US2 / SC-003)

1. 모드를 한 번도 고른 적 없는 다른 뷰에서 B가 필터 · 정렬 · 표시 속성을 바꾼다.
   **기대**: 전부 성공, A · C에 반영.
2. B가 그 뷰의 권한 메뉴를 연다. **기대**: 라벨 "공용". B가 만든 뷰가 아니면 버튼이
   비활성이고 "이 뷰의 권한은 바꿀 수 없습니다" 툴팁. (U-02, W-03)
3. 직접 API로 그 뷰에 `{"updatedFields":{"accessMode":"locked"}}`를 A가 보낸 뒤(모르는 값),
   B가 필터를 바꾼다. **기대**: 성공 — 모르는 값은 공용이다. (G-21) 끝나면 A가
   `{"deletedFields":["accessMode"]}`로 지운다.

## 시나리오 3: 개인 뷰 (US3 / SC-004 · SC-005)

1. B 창에서 새 뷰를 만든다("B의 작업"). 권한 메뉴를 연다. **기대**: 공용 · 개인 항목
   (관리자 없음). 개인을 고른다. (U-03, W-05)
2. A · C 창을 본다(새로고침 없이). **기대**: "B의 작업" 탭이 사라졌다. A도 못 본다.
   (F-07, FR-012)
3. C가 "B의 작업" 주소(`/boards/<team>/<board>/<viewId>`)로 직접 들어간다. **기대**:
   빈 화면이 아니라 첫 번째 보이는 뷰로 떨어진다. (FR-014, U-14) 이어서 C가 "B의 작업"을
   마지막으로 보고 있던 상태를 흉내 내려면 DevTools Console에서
   `localStorage`의 lastViewId 항목을 그 뷰 ID로 바꾼 뒤 보드 주소(viewId 없이)로 들어간다.
   **기대**: 같은 결과.
4. C 세션으로 직접 호출:
   ```bash
   # 단일 블록 조회
   curl -s -H "X-Requested-With: XMLHttpRequest" -b "$C_COOKIE" \
     "http://localhost:8065/plugins/focalboard/api/v2/boards/$BOARD/blocks?block_id=$PRIVATE_VIEW"
   ```
   **기대**: `[]`. (F-02) `?all=true` 응답에도 그 ID가 없다. (F-01)
5. C 세션으로 patch · delete · duplicate · undelete를 각각 보낸다. **기대**: 모두 `403`.
   (G-18)
6. B 창에서 "B의 작업"의 필터를 바꾼다. **기대**: 성공. (G-17)
7. B가 "B의 작업"을 공용으로 되돌린다. **기대**: A · C 탭에 나타난다. (F-09)
8. B가 다시 개인으로 바꾸고 둔다(시나리오 6에서 쓴다).

## 시나리오 4: 전환 규칙과 마지막 비개인 뷰 보호 (US4 / SC-006 · SC-007)

1. 공용 뷰를 하나만 남기고 나머지 공용 뷰를 지운다(A). 이제 보드에 공용 1 + B의 개인 1.
2. 그 공용 뷰를 만든 사람(A라고 가정)이 권한 메뉴를 연다. **기대**: 개인 항목이 없다.
   (W-06) 직접 API로 `accessMode: private`를 보내면 `400`. (G-15)
3. A가 그 뷰의 탭 메뉴를 연다. **기대**: 뷰 삭제가 없다. (W-11) 직접 DELETE하면 `400`.
   (G-16)
4. B가 "B의 작업"(개인)의 탭 메뉴를 연다. **기대**: 삭제 있음 — 개인 뷰는 보호 대상이
   아니다.
5. 공용 뷰를 하나 더 만든 뒤 2번을 반복한다. **기대**: 개인 항목이 다시 보인다.
6. C 세션으로 A가 만든 공용 뷰에 `accessMode: private`. **기대**: `403`. (G-12)
7. B 세션으로 아무 공용 뷰에 `accessMode: admin`. **기대**: `403`. (G-10)

## 시나리오 5: 뷰 복제와 보드 복제 (FR-026 · FR-027 · FR-028)

1. 관리자 뷰를 B가 복제한다. **기대**: 사본이 만들어지고 사본의 권한 라벨은 "공용",
   B가 사본의 필터를 바꿀 수 있다. (W-12)
2. B 세션으로 관리자 뷰에 `POST .../blocks/$VIEW/duplicate`. **기대**: `200`, 응답 블록의
   `fields.accessMode`가 없다. (G-13)
3. C가 보드를 복제한다(보드 메뉴 → 복제). **기대**: 사본 보드에 "B의 작업"이 없고,
   관리자 뷰는 관리자 모드로 복사됐다. (F-10 · F-12)
4. A가 보드 아카이브를 내보낸다(뷰 헤더 ··· 메뉴). 압축을 풀어 `board.jsonl`에서
   "B의 작업" ID를 찾는다. **기대**: 없다. (F-11)

## 시나리오 6: 관리자용 개인 뷰 목록 (US6 / SC-008)

1. A가 공유 위젯(공유 버튼)을 연다. **기대**: 속성 편집 잠금 토글 아래에 "개인 뷰"
   섹션이 있고 "B의 작업"이 B의 이름 · 만든 날짜와 함께 있다. 필터 · 정렬 내용은 없다.
   (U-12, A-01)
2. B가 공유 위젯을 연다. **기대**: 개인 뷰 섹션이 없다. (W-15) B 세션으로 GET
   `.../views/private`. **기대**: `403`. (A-02)
3. A가 "B의 작업" 삭제를 누른다. **기대**: 확인 다이얼로그 → 확인 → 목록에서 사라지고,
   B 창의 탭에서도 새로고침 없이 사라진다. (U-13, A-04)
4. A 세션으로 공용 뷰 ID에 DELETE `.../views/private/$PUBLIC_VIEW`. **기대**: `404`. (A-06)
5. 개인 뷰가 없는 보드에서 1번. **기대**: "이 보드에는 개인 뷰가 없습니다". (W-16)

## 시나리오 7: 실시간 전환 중 열어 둔 화면 (Edge)

1. C가 공용 뷰 X를 보고 있다. A가 X를 관리자로 바꾼다. **기대**: C의 메뉴가 그 자리에서
   비활성으로 바뀐다. C가 바뀌기 전에 열어 둔 필터 패널로 저장을 시도하면 서버 거절
   플래시가 뜬다.
2. C가 B의 공용 뷰 Y를 보고 있다. B가 Y를 개인으로 바꾼다. **기대**: C의 화면이 첫 번째
   보이는 뷰로 이동하고 Y 탭이 사라진다. C의 DevTools Network(WS 프레임)에서 Y에 대한
   마지막 메시지는 `deleteAt`만 있는 블록이다 — `fields`가 없다. (F-07)

## 품질 게이트 (완료 선언 전)

```bash
make server-lint
make server-test 2>&1 | grep -E "^(--- FAIL|FAIL)" | sort | diff /tmp/022-server-baseline.txt -
cd webapp
npm run check
npm run test 2>&1 | grep -E "^(FAIL|●)" | sort | diff /tmp/022-webapp-baseline.txt -
npm run check-types 2>&1 | grep -c "error TS"      # 기준선과 같거나 적어야 한다
```

diff가 비어 있거나 기준선의 실패가 줄어들기만 하면 통과다. 새 실패가 하나라도 있으면
완료가 아니다. `ws.Adapter` mock을 재생성했으면 `make generate` 결과도 같은 커밋에
있는지 확인한다.

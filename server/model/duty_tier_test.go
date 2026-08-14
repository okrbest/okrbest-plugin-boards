// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// 009 US2 — 직책 묶음은 팀이 기억한다. 어느 직책이 C-Level인가는 회사 조직 구조지
// 보드 설정이 아니다.

func TestDutyTiersFromSettings(t *testing.T) {
	t.Run("팀 설정에서 읽는다", func(t *testing.T) {
		tiers, err := DutyTiersFromSettings(map[string]interface{}{
			DutyTiersKey: []interface{}{
				map[string]interface{}{"id": "tier-1", "name": "C-Level", "dutyIds": []interface{}{"duty-cso", "duty-coo"}},
			},
		})

		require.NoError(t, err)
		require.Len(t, tiers, 1)
		require.Equal(t, "C-Level", tiers[0].Name)
		require.Equal(t, []string{"duty-cso", "duty-coo"}, tiers[0].DutyIDs)
	})

	t.Run("설정이 없으면 빈 목록이다", func(t *testing.T) {
		tiers, err := DutyTiersFromSettings(nil)

		require.NoError(t, err)
		require.Empty(t, tiers)
	})

	t.Run("키가 없으면 빈 목록이다", func(t *testing.T) {
		tiers, err := DutyTiersFromSettings(map[string]interface{}{"somethingElse": 1})

		require.NoError(t, err)
		require.Empty(t, tiers)
	})

	t.Run("모양이 아니면 거절한다", func(t *testing.T) {
		_, err := DutyTiersFromSettings(map[string]interface{}{DutyTiersKey: "on"})

		require.Error(t, err, "반쯤 읽은 묶음은 권한을 조용히 바꾼다")
	})
}

func TestDutyTiersIntoSettings(t *testing.T) {
	t.Run("다른 키를 건드리지 않는다", func(t *testing.T) {
		settings := map[string]interface{}{"somethingElse": "keep me"}

		updated, err := DutyTiersIntoSettings(settings, []DutyTier{{ID: "t1", Name: "대표", DutyIDs: []string{"duty-ceo"}}})

		require.NoError(t, err)
		require.Equal(t, "keep me", updated["somethingElse"])
		require.NotNil(t, updated[DutyTiersKey])
	})

	t.Run("설정이 nil이어도 만든다", func(t *testing.T) {
		updated, err := DutyTiersIntoSettings(nil, []DutyTier{{ID: "t1", Name: "대표"}})

		require.NoError(t, err)
		require.NotNil(t, updated[DutyTiersKey])
	})

	t.Run("왕복해도 같다", func(t *testing.T) {
		want := []DutyTier{
			{ID: "t1", Name: "대표", DutyIDs: []string{"duty-ceo"}},
			{ID: "t2", Name: "C-Level", DutyIDs: []string{"duty-cso", "duty-coo"}},
		}

		stored, err := DutyTiersIntoSettings(nil, want)
		require.NoError(t, err)

		got, err := DutyTiersFromSettings(stored)
		require.NoError(t, err)
		require.Equal(t, want, got)
	})
}

func TestValidateDutyTiers(t *testing.T) {
	t.Run("이름이 비면 거절한다", func(t *testing.T) {
		err := ValidateDutyTiers([]DutyTier{{ID: "t1", Name: "", DutyIDs: []string{"duty-ceo"}}})

		require.Error(t, err, "매트릭스 열 제목이 빈칸이 된다")
	})

	t.Run("마스터에 없는 직책 ID는 통과한다", func(t *testing.T) {
		// 마스터는 메인 서버 소유라 저장 시점에 맞다고 보장할 수 없다. 002가
		// 조직·직책 ID를 검사하지 않는 것과 같은 판단이다.
		err := ValidateDutyTiers([]DutyTier{{ID: "t1", Name: "C-Level", DutyIDs: []string{"duty-retired"}}})

		require.NoError(t, err)
	})

	t.Run("직책이 하나도 없는 묶음도 통과한다", func(t *testing.T) {
		// 만드는 도중의 상태다. 아무에게도 안 걸릴 뿐 잘못된 상태가 아니다.
		err := ValidateDutyTiers([]DutyTier{{ID: "t1", Name: "팀장"}})

		require.NoError(t, err)
	})

	t.Run("id가 비면 거절한다", func(t *testing.T) {
		err := ValidateDutyTiers([]DutyTier{{ID: "", Name: "팀장"}})

		require.Error(t, err, "규칙이 가리킬 수 없는 묶음이다")
	})
}

func TestDutyTiersDutyIDsFor(t *testing.T) {
	tiers := []DutyTier{
		{ID: "t1", Name: "대표", DutyIDs: []string{"duty-ceo"}},
		{ID: "t2", Name: "C-Level", DutyIDs: []string{"duty-cso", "duty-coo"}},
	}

	t.Run("여러 묶음을 합집합으로 푼다", func(t *testing.T) {
		got := DutyIDsFor(tiers, []string{"t1", "t2"})

		require.ElementsMatch(t, []string{"duty-ceo", "duty-cso", "duty-coo"}, got)
	})

	t.Run("직책 하나짜리 묶음도 똑같이 푼다", func(t *testing.T) {
		require.Equal(t, []string{"duty-ceo"}, DutyIDsFor(tiers, []string{"t1"}))
	})

	t.Run("없는 묶음은 아무것도 내놓지 않는다", func(t *testing.T) {
		require.Empty(t, DutyIDsFor(tiers, []string{"t-gone"}))
	})
}

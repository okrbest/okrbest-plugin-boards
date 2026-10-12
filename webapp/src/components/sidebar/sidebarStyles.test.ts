// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// 018 V-01·V-02 계약 (contracts/ui-surfaces.md).
// jsdom은 SCSS를 계산하지 못하므로 스타일 소스를 직접 검사한다.
// 렌더된 수치의 최종 확인은 quickstart.md 실측이 담당한다.

import fs from 'fs'
import path from 'path'

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), 'utf8')

describe('018 sidebar visual contract (SCSS source)', () => {
    const boardItem = () => read('sidebarBoardItem.scss')
    const category = () => read('sidebarCategory.scss')
    const sidebar = () => read('sidebar.scss')

    it('V-01: 활성 항목은 반전 배경·글자 변수를 쓴다', () => {
        expect(boardItem()).toContain('--sidebar-text-active-border-rgb')
        expect(boardItem()).toContain('--sidebar-text-active-color')
    })

    it('V-01: 활성 항목의 좌측 세로선(::before 2px) 규칙이 없다', () => {
        expect(boardItem()).not.toMatch(/&::before[\s\S]{0,200}width: 2px/)
        expect(category()).not.toMatch(/&::before[\s\S]{0,200}width: 2px/)
    })

    it('V-02: hover 배경은 채널 토큰을 폴백과 함께 쓴다', () => {
        expect(boardItem()).toContain('var(--sidebar-text-hover-bg')
    })

    it('V-04: 사이드바 폭은 clamp 가변이고 240px 고정이 없다', () => {
        expect(sidebar()).toContain('clamp(180px, 19vw, 440px)')
        expect(sidebar()).not.toMatch(/flex: 0 0 240px/)
    })

    it('V-05: 고정 메뉴 오프셋이 240px 하드코딩 대신 폭 변수를 쓴다', () => {
        expect(boardItem()).not.toContain('calc(64px + 240px - 50px)')
        expect(category()).not.toContain('calc(64px + 240px - 50px)')
    })

    it('V-06: 토글 버튼은 채널 토글 라이브 실측을 따른다 — 버튼 48px, 아이콘 30px, radius 6px', () => {
        // 채널 ChannelSidebarToggle 실측(2026-10-12): 버튼 48×48, 아이콘 font-size 30px(글리프 42×43)
        const switcher = fs.readFileSync(path.join(__dirname, '../boardsSwitcher/boardsSwitcher.scss'), 'utf8')
        expect(switcher).toMatch(/\.hide-sidebar-icon[\s\S]{0,500}width: 48px/)
        expect(switcher).toMatch(/\.hide-sidebar-icon[\s\S]{0,500}border-radius: 6px/)
        expect(switcher).toMatch(/\.hide-sidebar-icon[\s\S]{0,500}font-size: 30px/)
    })

    it('V-07: 활성(반전) 행의 메뉴 버튼은 행 글자색을 상속한다', () => {
        // 반전 배경 위에서 전역 .IconButton 색(어두운 글자)이 그대로면 ⋯가 묻힌다
        expect(boardItem()).toMatch(/&\.active[\s\S]{0,600}\.IconButton[\s\S]{0,120}color: inherit/)
        expect(category()).toMatch(/&\.active[\s\S]{0,600}\.IconButton[\s\S]{0,120}color: inherit/)
    })

    it('V-08: 카테고리 셰브론은 채널처럼 -90° 회전 규칙을 쓴다 (0.15s ease-out)', () => {
        expect(category()).toMatch(/\.ChevronDownIcon[\s\S]{0,300}transition: transform 0\.15s ease-out/)
        expect(category()).toMatch(/collapsed[\s\S]{0,300}rotate\(-90deg\)/)
    })

    it('V-09: 카테고리 명칭은 채널 헤더처럼 불투명 글자·명시 폰트를 쓴다', () => {
        expect(category()).toMatch(/&\.category-title[\s\S]{0,400}color: rgb\(var\(--sidebar-text-rgb\)\)/)
        expect(category()).toMatch(/&\.category-title[\s\S]{0,400}'Open Sans', 'Noto Sans KR'/)
    })

    it('V-10: 카테고리 명칭·간격은 채널 라이브 실측값을 따른다 — 15px/500, 대문자 없음, 헤더 28px, 카테고리 간 24px', () => {
        // 채널 사이드바 라이브 실측(2026-10-12): 헤더 텍스트 15px/500/none, 버튼 28px,
        // 다음 그룹 margin-top 24px. upstream 소스(12px/uppercase)가 아니라 포크 라이브가 기준이다.
        expect(category()).toMatch(/&\.category-title[\s\S]{0,500}font-size: 15px/)
        expect(category()).toMatch(/&\.category-title[\s\S]{0,500}font-weight: 500/)
        expect(category()).not.toMatch(/&\.category-title[\s\S]{0,500}text-transform: uppercase/)
        expect(category()).toMatch(/&\.category[\s\S]{0,400}height: 28px/)

        // 카테고리는 draggable 래퍼에 싸여 항상 :first-child다 — 간격은 래퍼 형제 기준으로만 성립한다
        expect(sidebar()).toMatch(/> div \+ div \.SidebarCategory[\s\S]{0,100}margin-top: 24px/)
        expect(category()).not.toMatch(/\.SidebarCategory[\s\S]{0,200}margin-top: 24px/)
    })

    it('V-11: 카테고리→보드→뷰가 단계별로 들여쓰기된다 — 보드 42px(아이콘 x40), 뷰 66px(x64)', () => {
        // 계단: 카테고리 명칭 x40 → 보드 아이콘 x40(42-2) → 보드 라벨 x64 → 뷰 x64.
        // 아이콘 마진은 채널 행 규칙(0 6px 0 -2px)을 유지한다.
        expect(boardItem()).toMatch(/&\.subitem[\s\S]{0,300}padding-left: 42px/)
        expect(boardItem()).toMatch(/&\.sidebar-view-item[\s\S]{0,300}padding-left: 66px/)
        expect(boardItem()).toMatch(/\.octo-sidebar-icon[\s\S]{0,300}margin: 0 6px 0 -2px/)
        expect(category()).toMatch(/&\.subitem[\s\S]{0,300}padding-left: 42px/)
        expect(category()).toMatch(/HiddenBoardsRow[\s\S]{0,900}&__item[\s\S]{0,200}padding-left: 66px/)
    })
})

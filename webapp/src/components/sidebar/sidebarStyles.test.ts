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

    it('V-06: 토글 버튼은 채널 토글 문법을 따른다 — 행 규격 28px, radius 6px, hover만 배경', () => {
        const switcher = fs.readFileSync(path.join(__dirname, '../boardsSwitcher/boardsSwitcher.scss'), 'utf8')
        expect(switcher).toMatch(/\.hide-sidebar-icon[\s\S]{0,400}width: 28px/)
        expect(switcher).toMatch(/\.hide-sidebar-icon[\s\S]{0,400}border-radius: 6px/)
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
})

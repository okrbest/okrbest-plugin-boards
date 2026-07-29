# 이 포크에 기여하기 (okrbest/okrbest-plugin-boards)

기능 작업은 spec-kit + superpowers 워크플로를 따릅니다. 시작 전에
**[SPEC_KIT_GUIDE.md](SPEC_KIT_GUIDE.md)**를 읽으세요.

1. `main`에 직접 커밋하지 않습니다. 작업당 브랜치 1개 + PR.
2. 기능·API 변경은 `/speckit-specify`로 명세부터 만듭니다 (정본: `specs/<NNN-feature>/`, 한국어).
3. 머지 전 품질 게이트: webapp은 `make webapp-ci`, server는 `make server-lint` + `make server-test`
   (server 테스트는 CI가 돌리지 않으므로 로컬 실행 필수).
4. 전체 규칙: [.specify/memory/constitution.md](.specify/memory/constitution.md).

아래는 upstream(mattermost/focalboard)에서 온 원본 안내입니다.

---

# Disclaimer

> [!WARNING]
> **Effective September 15th, 2023, Mattermost, Inc. staff are no longer reviewing or merging pull requests for either Focalboard or the Mattermost Boards plugin in this repository (`mattermost/focalboard`). We encourage the community to fork this repository for continued development and contributions.**
>
> The reason behind these changes is to focus Mattermost developer resources on improving the platform’s performance and core features to ensure Mattermost continues being resilient, stable, and best-in-breed for critical operations.
>
> ️💡 [Learn more](https://forum.mattermost.com/t/upcoming-product-changes-to-boards-and-various-plugins/16669)

## Past maintainers

- **Scott Bishel**: [@sbishel](https://github.com/sbishel)
- **Jesús Espino**: [@jespino](https://github.com/jespino)
- **Doug Lauder**: [@wiggin77](https://github.com/wiggin77)
- **Miguel de la Cruz**: [@mgdelacroix](https://github.com/mgdelacroix)
- **Harshil Sharma**: [@harshilsharma63](https://github.com/harshilsharma63)
- **Chen Lim**: [@chenilim](https://github.com/chenilim)
- **Ogi Marušić**: [@ogi-m](https://github.com/ogi-m)
- **Winson Wu**: [@wuwinson](https://github.com/wuwinson)
- **Justine Geffen**: [@justinegeffen](https://github.com/justinegeffen)

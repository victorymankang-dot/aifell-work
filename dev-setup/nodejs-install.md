# Windows 웹 개발 환경 설치 기록 (Node.js · npm · Git)

- 날짜: 2026-10-26
- OS: Windows 11 Pro (10.0.26200)
- 목적: 이 컴퓨터에서 웹 개발을 시작하기 위한 기본 도구 확인 및 설치

## 1. 설치 전 확인

| 도구 | 상태 |
|---|---|
| Node.js | 미설치 |
| npm | 미설치 (Node.js와 함께 설치됨) |
| Git | 설치되어 있음 (2.56.0) |
| winget | 사용 가능 (Windows 공식 패키지 관리자) |

## 2. 설치 과정

### 시도 1·2: winget으로 설치 (실패)

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

- winget이 공식 패키지 `OpenJS.NodeJS.LTS`(Node.js 24.22.1 LTS)를 `nodejs.org`에서 내려받고 해시 검증까지 성공.
- 설치 단계에서 관리자 권한(UAC)을 요청했으나, 두 번 모두 Windows Installer가 **종료 코드 1602 (사용자가 설치 취소)** 로 끝남.
- 원인 추정: 백그라운드 셸에서 실행된 설치라 UAC 승인 창이 제대로 표시되지 않음.

### 시도 3: 공식 설치 파일(.msi) 직접 실행 (성공)

- winget이 받아둔 공식 설치 파일 `node-v24.22.1-x64.msi`를 화면에 일반 설치 창으로 실행.
- 실행 전 디지털 서명 확인: **유효(Valid), 서명자 OpenJS Foundation**.
- 설치 창에서 라이선스 동의 → 기본 옵션으로 설치 → UAC 승인 → 완료.

```powershell
msiexec /i node-v24.22.1-x64.msi
```

## 3. 설치 결과

```
> node --version
v24.22.1
> npm --version
11.19.1
> git --version
git version 2.56.0.windows.2
```

| 도구 | 버전 |
|---|---|
| Node.js | v24.22.1 (LTS) |
| npm | 11.19.1 |
| Git | 2.56.0 |

## 참고

- 설치 전에 열려 있던 터미널·에디터는 PATH가 갱신되지 않으므로 다시 열어야 `node`, `npm` 명령이 인식됨.
- winget 설치가 1602로 실패하면, Node.js 공식 사이트(nodejs.org)에서 LTS 설치 파일을 받아 직접 실행하는 방법이 확실함.

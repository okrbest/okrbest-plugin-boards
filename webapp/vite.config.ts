// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development'

    return {
        // Mattermost 내에서 로드되므로 상대 경로 사용
        base: './',
    
        plugins: [
            react({
                babel: {
                    plugins: [
                        // ['formatjs', {
                        //   idInterpolationPattern: '[sha512:contenthash:base64:6]',
                        //   ast: true
                        // }]
                    ]
                }
            }),
            viteStaticCopy({
                targets: [
                    { src: 'static/*', dest: 'static' }
                ]
            })
        ],

        resolve: {
            alias: [
                { find: '@', replacement: path.resolve(__dirname, './src') },
            ],
            //  호환성을 위해 ESM 우선 순위 지정
            mainFields: ['module', 'browser', 'main'],
        },

        optimizeDeps: {
            // ESM 모듈도 pre-bundling 대상에 포함
            esbuildOptions: {
                target: 'es2019',
            },
            // 강제로 pre-bundling (의존성 변경 시 자동 재빌드)
            force: false,
        },
        
        // 개발 서버 설정
        server: {
            // HMR 최적화
            hmr: {
                overlay: true, // 에러 오버레이 표시
            },
            // 파일 시스템 감시 최적화
            watch: {
                // node_modules 제외로 성능 개선
                ignored: ['**/node_modules/**', '**/pack/**'],
            },
        },

        build: {
            outDir: 'pack', // 기존 Webpack output path와 일치
            emptyOutDir: false, // watch 모드에서 기존 파일 유지 (깜빡임 방지)
            
            // 빌드 최적화
            minify: isDev ? false : 'esbuild', // esbuild가 terser보다 빠름
            sourcemap: isDev ? false : 'hidden', // production에서는 hidden 소스맵 (파일 크기 절감)
            target: 'es2019', // 최소 지원 브라우저 타겟
            
            // CSS 최적화
            cssCodeSplit: false, // UMD 번들은 단일 CSS 파일 필요
            cssMinify: !isDev, // production에서만 CSS 압축
            
            // 빌드 성능 최적화
            reportCompressedSize: false, // 빌드 시간 단축 (큰 번들에서 느림)
            chunkSizeWarningLimit: 1000, // chunk 크기 경고 임계값 (KB)
            
            lib: {
                entry: path.resolve(__dirname, 'src/main.tsx'),
                name: 'Focalboard',
                formats: ['umd'], // Mattermost 플러그인은 보통 UMD 사용
                fileName: () => `static/main.js` // 고정된 파일명
            },
            rollupOptions: {
                // 외부 의존성 설정 (Mattermost가 제공하는 패키지들)
                external: [
                    'react',
                    'react-dom',
                    'react-redux',
                    'redux',
                    'prop-types',
                    // 'react-intl', // 필요시 주석 해제 (Mattermost 버전에 따라 다름)
                ],
                output: {
                    globals: {
                        react: 'React',
                        'react-dom': 'ReactDOM',
                        'react-redux': 'ReactRedux',
                        redux: 'Redux',
                    },
                    // CSS 파일명 고정
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name === 'style.css') return 'static/main.css'
                        return 'static/[name][extname]'
                    },
                    // Tree shaking 최적화
                    manualChunks: undefined, // UMD는 단일 번들 필요
                },
                // Tree shaking 최적화
                treeshake: {
                    preset: 'recommended',
                    moduleSideEffects: (id) => {
                        // CSS 파일과 일부 라이브러리는 side effect 있음
                        return /\.(css|scss)$/.test(id) || 
                               id.includes('emoji-mart') ||
                               id.includes('@mattermost/compass-icons')
                    },
                },
                // Watch 모드 최적화
                watch: {
                    include: 'src/**',
                    exclude: ['node_modules/**', 'pack/**', 'dist/**']
                }
            },
            commonjsOptions: {
                include: [/node_modules/],
                transformMixedEsModules: true,
                // CommonJS 변환 최적화
                defaultIsModuleInterop: true,
            },
            // 빌드 성능 최적화
            assetsInlineLimit: 4096, // 4KB 이하 자산은 인라인 (base64)
        },
    
        define: {
            // 환경 변수 매핑
            'process.env.NODE_ENV': JSON.stringify(mode || 'production'),
            // 개발 모드에서만 디버그 플래그
            __DEV__: isDev,
        },
        
        // 로그 레벨 설정
        logLevel: isDev ? 'info' : 'warn',
    }
})

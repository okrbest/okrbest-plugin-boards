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
            alias: {
                '@': path.resolve(__dirname, './src'),
                // Yjs 중복 로드 방지 및 ESM 강제
                'yjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
            },
            // BlockSuite 호환성을 위해 ESM 우선 순위 지정
            mainFields: ['module', 'browser', 'main'],
            // 중복 패키지 방지 (BlockSuite와 Yjs가 여러 번 번들링되는 것 방지)
            dedupe: ['yjs', '@blocksuite/store', '@blocksuite/blocks', '@blocksuite/presets'],
        },

        // 개발 서버 최적화: BlockSuite와 Yjs를 pre-bundling
        optimizeDeps: {
            include: [
                'yjs',
                '@blocksuite/store',
                '@blocksuite/blocks',
                '@blocksuite/presets',
            ],
            // ESM 모듈도 pre-bundling 대상에 포함
            esbuildOptions: {
                target: 'es2019',
            },
        },

        build: {
            outDir: 'pack', // 기존 Webpack output path와 일치
            emptyOutDir: false, // watch 모드에서 기존 파일 유지 (깜빡임 방지)
            // 개발 모드 최적화: 압축 및 소스맵 비활성화로 빌드 속도 향상
            minify: isDev ? false : 'esbuild',
            sourcemap: isDev ? false : true, 
            
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
                    }
                },
                // Watch 모드 최적화
                watch: {
                    include: 'src/**',
                    exclude: 'node_modules/**'
                }
            },
            commonjsOptions: {
                include: [/node_modules/],
                transformMixedEsModules: true
            }
        },
    
        define: {
        // 환경 변수 매핑
            'process.env.NODE_ENV': JSON.stringify(mode || 'production'),
        }
    }
})

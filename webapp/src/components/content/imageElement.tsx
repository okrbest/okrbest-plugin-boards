// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react'
import {IntlShape} from 'react-intl'

import {ContentBlock} from '../../blocks/contentBlock'
import {ImageBlock, createImageBlock} from '../../blocks/imageBlock'
import octoClient from '../../octoClient'
import {Utils} from '../../utils'
import ImageIcon from '../../widgets/icons/image'
import {sendFlashMessage} from '../../components/flashMessages'

import {FileInfo} from '../../blocks/block'
import ImagePreviewModal from '../imagePreviewModal/imagePreviewModal'
import RootPortal from '../rootPortal'

import {contentRegistry} from './contentRegistry'
import ArchivedFile from './archivedFile/archivedFile'

type Props = {
    block: ContentBlock
}

const ImageElement = (props: Props): React.JSX.Element|null => {
    const [imageDataUrl, setImageDataUrl] = useState<string|null>(null)
    const [fileInfo, setFileInfo] = useState<FileInfo>({})
    const [showPreview, setShowPreview] = useState(false)

    const {block} = props

    useEffect(() => {
        console.log('ImageElement MOUNTED', {blockId: block.id, fileId: props.block.fields.fileId})
    }, [])

    useEffect(() => {
        if (!imageDataUrl) {
            const loadImage = async () => {
                const fileURL = await octoClient.getFileAsDataUrl(block.boardId, props.block.fields.fileId)
                console.log('ImageElement loaded', {fileURL})
                setImageDataUrl(fileURL.url || '')
                setFileInfo(fileURL)
            }
            loadImage()
        }
    }, [])

    if (fileInfo.archived) {
        return (
            <ArchivedFile fileInfo={fileInfo}/>
        )
    }

    if (!imageDataUrl) {
        return null
    }

    return (
        <>
            <img
                className='ImageElement'
                src={imageDataUrl}
                alt={block.title}
                onClick={(e) => {
                    console.log('Image clicked!', {showPreview, imageDataUrl})
                    e.preventDefault()
                    e.stopPropagation()
                    setShowPreview(true)
                }}
                style={{cursor: 'pointer'}}
            />
            {showPreview && (
                <RootPortal>
                    <ImagePreviewModal
                        imageUrl={imageDataUrl}
                        title={block.title}
                        onClose={() => {
                            console.log('Closing modal')
                            setShowPreview(false)
                        }}
                    />
                </RootPortal>
            )}
        </>
    )
}

contentRegistry.registerContentType({
    type: 'image',
    getDisplayText: (intl: IntlShape) => intl.formatMessage({id: 'ContentBlock.image', defaultMessage: 'image'}),
    getIcon: () => <ImageIcon/>,
    createBlock: async (boardId: string, intl: IntlShape) => {
        return new Promise<ImageBlock>(
            (resolve) => {
                Utils.selectLocalFile(async (file) => {
                    const fileId = await octoClient.uploadFile(boardId, file)

                    if (fileId) {
                        const block = createImageBlock()
                        block.fields.fileId = fileId || ''
                        resolve(block)
                    } else {
                        sendFlashMessage({content: intl.formatMessage({id: 'createImageBlock.failed', defaultMessage: 'Unable to upload the file. File size limit reached.'}), severity: 'normal'})
                    }
                },
                '.jpg,.jpeg,.png,.gif')
            },
        )

        // return new ImageBlock()
    },
    createComponent: (block) => <ImageElement block={block}/>,
})

export default React.memo(ImageElement)

// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.


import React, {useState, useLayoutEffect} from 'react'
import ReactDOM from 'react-dom'

type Props = {
    children: React.ReactNode
}

const RootPortal = (props: Props): React.JSX.Element => {
    const [el] = useState(document.createElement('div'))

    useLayoutEffect(() => {
        document.body.appendChild(el)
        return () => {
            document.body.removeChild(el)
        }
    }, [])

    return ReactDOM.createPortal(props.children, el)  // eslint-disable-line
}

export default React.memo(RootPortal)

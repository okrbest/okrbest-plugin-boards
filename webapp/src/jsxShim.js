// jsx-runtime shim: converts jsx() to React.createElement() for Mattermost compatibility
const React = window.React;

export const Fragment = React.Fragment;

export function jsx(type, props, key) {
    if (arguments.length > 2) {
        return React.createElement(type, { ...props, key });
    }
    return React.createElement(type, props);
}

export function jsxs(type, props, key) {
    // jsxs is for static children: spread them as separate args so React
    // treats them as positional children (no key warning).
    const { children, ...restProps } = props;
    if (key !== undefined) {
        restProps.key = key;
    }
    if (Array.isArray(children)) {
        return React.createElement(type, restProps, ...children);
    }
    return React.createElement(type, restProps, children);
}

export const jsxDEV = jsx;

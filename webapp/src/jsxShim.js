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
    if (arguments.length > 2) {
        return React.createElement(type, { ...props, key });
    }
    return React.createElement(type, props);
}

export const jsxDEV = jsx;

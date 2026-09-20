/**
 * `cordis:` 内置 bundle 注册表（P1）。当前为空表：任何 `cordis:<key>` 都 fail-closed 报错，
 * 不给"内置但未实现"留静默。将来把真正内建装配（如 revision/identify 等）登记到这里，
 * 与动态 `import()` 走同一条 unwrapExports 归形。
 */
export const builtins: Record<string, unknown> = {}
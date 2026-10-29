# 开发与测试

需要 Node.js 22+ 和支持 ES Modules、IndexedDB、Service Worker 的现代浏览器。应用和逻辑测试均无第三方运行时依赖。

## 运行与检查

```sh
npm start
npm start -- --port=8081
npm run check
npm test
```

开发服务器只监听本机 `127.0.0.1`。使用 HTTP 地址访问，不要直接双击 HTML 文件。

自动测试使用构造的小词表和公开预置数据，不读取个人学习记录或私人导入文件。覆盖判分、去重合并、轮次接续、加练、草场、金币、BIN 合成输入和词库一致性。

GitHub Actions 在 main 推送和 Pull Request 时执行语法检查与测试。Pages 发布独立运行，发布后仍应检查实际页面。

## 格式化

```sh
npm ci --ignore-scripts
npm run format:check
npm run format
```

Prettier 仅用于开发。词库 JSON 不参与重排。

## 批量词族资料

`wordbooks/families.json` 是独立的只读资料，已有词库和旧词典缓存会自动读取。它不将派生词批量加入主词库，也不改动轮次、成绩或金币。词族练习中的“加入主词库”仍由使用者自行选择。

生成器使用 Python 3 标准库。下载 WordNet 3.0（NLTK 数据镜像）、ECDICT CSV、ipa-dict 的 en_US.txt 及 LICENSE 后运行：

```sh
python tools/build-families.py --wordnet /path/wordnet.zip --ecdict /path/ecdict.csv --ipa-us /path/en_US.txt --ipa-license /path/IPA-DICT-LICENSE.txt
npm test
```

输入网址、SHA256、覆盖数量和筛选规则记录在 `wordbooks/families-lock.json`；再生成时应核对输入 hash，并随新数据更新资源版本与 Service Worker 缓存版本。原始下载不提交到仓库。词族只采用词典中的派生关联，中文词性须与目标词匹配；缺失音标继续由练习页面联网查询。

## 浏览器验收

使用独立测试浏览器资料或自建词条，避免在真实进度上随意答题。

1. 检查首页、预置词库与各入口。
2. 输入部分答案后切换页面、刷新，验证接续。
3. 验证重试、两次错误、跳过、上一题、照打与拓展。
4. 检查草场和金币跟随正式结果。
5. 在独立测试资料中验证备份恢复。
6. 检查小屏、主题、音频服务失败和离线缓存。

这是验收清单，不代表所有设备已经自动验证。

## 发布与资料安全

仓库使用 `main` 分支根目录发布到 `https://jarvisyaokw.github.io/`。资源使用根路径，复制到项目子路径时需要适配。

保持 `runtime-config.mjs` 为 browser 模式。不要提交服务器 `data/`、个人备份、部署令牌或原始 PDF。修改前保留备份，推送前检查，发布后验证。不同网址的数据通过完整备份迁移。

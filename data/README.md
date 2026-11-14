# 教材データの配置

講座提供の教材（PDF 5 本・テスト質問 CSV）は再配布しないため、このリポジトリには含めていない。
受講時に配布されたファイルを、次のファイル名のまま配置する（`.gitignore` で Git 管理外になっている）。

```
data/
├── pdfs/
│   ├── case3-doc1-employment-rules.pdf
│   ├── case3-doc2-expense-manual.pdf
│   ├── case3-doc3-security-policy.pdf
│   ├── case3-doc4-remote-work.pdf
│   └── case3-doc5-it-onboarding.pdf
└── eval/
    ├── raw/
    │   └── case3-test-questions.csv   ← 配布された CSV をそのまま置く（補正前）
    ├── test-questions.csv             ← 下のコマンドで生成
    └── key-facts.json                 ← リポジトリに含まれる（採点用の必須要素）
```

```bash
mkdir -p data/pdfs data/eval/raw
cp <配布フォルダ>/case3-doc*.pdf data/pdfs/
cp <配布フォルダ>/case3-test-questions.csv data/eval/raw/

npm run eval:fix-csv   # 金額カンマによる列ずれ（5・6 番）を補正し data/eval/test-questions.csv を生成
npm run ingest:dry     # 5 ファイル / 34 チャンクに分割されることを確認（キー・DB 不要）
```

- 教材を配置しなくても `npm test` は通る（教材を使うテストは自動でスキップされる）。
- `npm run eval` の結果は `data/eval/results/` に保存される（教材の質問文を含むため Git 管理外）。

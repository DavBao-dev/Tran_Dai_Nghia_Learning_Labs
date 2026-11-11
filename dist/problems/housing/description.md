# Dự đoán giá nhà

Thử sức với bài toán hồi quy: dự đoán giá nhà từ diện tích, số phòng và vị trí.

## Mục tiêu

Dự đoán price (triệu đồng) cho mỗi căn nhà. Dữ liệu hoàn toàn giả lập, chỉ dùng thực hành.

## Dữ liệu

- [train.csv](data/train.csv) — dữ liệu huấn luyện.
- [test.csv](data/test.csv) — dữ liệu cần dự đoán.

> Dữ liệu đi kèm là mẫu nhỏ để thực hành.

## Gợi ý

Tạo baseline Ridge, thử log-transform mục tiêu và xem các mẫu có sai số lớn.

## Validation

Dùng một tập validation độc lập. Nếu có địa chỉ hoặc khu vực trùng, chia theo nhóm địa lý.

## Bài nộp

Metric: **RMSE ↓**.

Hai cột: `id,price`. Mỗi ID phải xuất hiện đúng một lần.

Giá trị là số hữu hạn ≥ 0.

```csv
id,price
401,2800
402,5300
403,7600
```

Chưa có máy chấm giữ nhãn kiểm thử riêng; bản hiện tại kiểm tra định dạng CSV.

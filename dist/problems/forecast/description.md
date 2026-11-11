# Dự báo nhu cầu bán hàng

Dự báo lượng bán trong những ngày tiếp theo bằng xu hướng và thông tin khuyến mãi.

## Mục tiêu

Dự đoán sales không âm cho các ngày tiếp theo. Các dòng được sắp xếp theo thời gian; dữ liệu giả lập.

## Dữ liệu

- [train.csv](data/train.csv) — dữ liệu huấn luyện.
- [test.csv](data/test.csv) — dữ liệu cần dự đoán.

> Dữ liệu đi kèm là mẫu nhỏ để thực hành.

## Gợi ý

Bắt đầu bằng naive forecast hoặc Ridge theo day, promotion và weekend. Không dùng thông tin tương lai để tạo đặc trưng.

## Validation

Chia train/validation theo thứ tự thời gian, không shuffle. Dùng backtesting khi có đủ lịch sử.

## Bài nộp

Metric: **MAE ↓**.

Hai cột: `id,sales`. Mỗi ID phải xuất hiện đúng một lần.

Giá trị là số hữu hạn ≥ 0.

```csv
id,sales
501,72
502,95
503,62
```

Chưa có máy chấm giữ nhãn kiểm thử riêng; bản hiện tại kiểm tra định dạng CSV.

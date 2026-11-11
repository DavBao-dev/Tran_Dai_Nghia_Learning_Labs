# Phát hiện tin nhắn rác

Xây dựng bộ lọc để phân biệt tin nhắn thông thường với nội dung quảng cáo và lừa đảo.

## Mục tiêu

Gán nhãn 0 cho tin nhắn thông thường, 1 cho tin nhắn rác.

## Dữ liệu

- [train.csv](data/train.csv) — dữ liệu huấn luyện.
- [test.csv](data/test.csv) — dữ liệu cần dự đoán.

> Dữ liệu đi kèm là mẫu nhỏ để thực hành.

## Gợi ý

Thử TF-IDF ký tự và từ; xem precision/recall của lớp spam thay vì chỉ xem accuracy.

## Validation

Chia validation phân tầng theo nhãn. Đưa các tin nhắn cùng mẫu quảng cáo vào cùng một phía để tránh rò rỉ.

## Bài nộp

Metric: **F1 (spam)**.

Hai cột: `id,label`. Mỗi ID phải xuất hiện đúng một lần.

Nhãn hợp lệ: `0`, `1`.

```csv
id,label
201,1
202,0
203,1
```

Chưa có máy chấm giữ nhãn kiểm thử riêng; bản hiện tại kiểm tra định dạng CSV.

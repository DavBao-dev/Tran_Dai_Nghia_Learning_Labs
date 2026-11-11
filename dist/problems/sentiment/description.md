# Phân tích cảm xúc tiếng Việt

Nhận diện cảm xúc tích cực, trung tính và tiêu cực trong những đánh giá tiếng Việt.

## Mục tiêu

Dự đoán nhãn cảm xúc cho mỗi đánh giá. Nhãn 0 là tiêu cực, 1 là trung tính và 2 là tích cực.

## Dữ liệu

- [train.csv](data/train.csv) — dữ liệu huấn luyện.
- [test.csv](data/test.csv) — dữ liệu cần dự đoán.

> Dữ liệu đi kèm là mẫu nhỏ để thực hành.

## Gợi ý

Giữ dấu tiếng Việt và từ phủ định. Thử TF-IDF + Logistic Regression trước khi dùng mô hình lớn.

## Validation

Dùng stratified train/validation split khi mỗi lớp có đủ mẫu. Kiểm tra dữ liệu trùng giữa hai tập.

## Bài nộp

Metric: **Macro F1**.

Hai cột: `id,label`. Mỗi ID phải xuất hiện đúng một lần.

Nhãn hợp lệ: `0`, `1`, `2`.

```csv
id,label
101,2
102,0
103,1
```

Chưa có máy chấm giữ nhãn kiểm thử riêng; bản hiện tại kiểm tra định dạng CSV.

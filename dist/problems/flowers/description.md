# Phân loại hoa Iris

Tìm loài hoa từ bốn đặc trưng kích thước đài hoa và cánh hoa.

## Mục tiêu

Dự đoán loài hoa: 0 — setosa, 1 — versicolor, 2 — virginica. Các kích thước được đo bằng cm.

## Dữ liệu

- [train.csv](data/train.csv) — dữ liệu huấn luyện.
- [test.csv](data/test.csv) — dữ liệu cần dự đoán.

> Dữ liệu đi kèm là mẫu nhỏ để thực hành.

## Gợi ý

So sánh Logistic Regression, KNN và Random Forest. Chuẩn hóa đặc trưng khi dùng mô hình khoảng cách.

## Validation

Dùng stratified split và fit StandardScaler chỉ trên tập train trong pipeline.

## Bài nộp

Metric: **Macro F1**.

Hai cột: `id,label`. Mỗi ID phải xuất hiện đúng một lần.

Nhãn hợp lệ: `0`, `1`, `2`.

```csv
id,label
301,0
302,1
303,2
```

Chưa có máy chấm giữ nhãn kiểm thử riêng; bản hiện tại kiểm tra định dạng CSV.

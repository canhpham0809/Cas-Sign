# Test case: Cập nhật loại ký (signType), mã số thuế và vùng ký — CAS Sign

- **Nguồn yêu cầu:** "[eSign] Cập nhật API Request Document (POST /request-document, upload PDF)" — mục A (Thay đổi field), mục B (Validate và lỗi trả về); kèm các thay đổi giao diện đi theo: chọn loại ký, chọn loại vùng ký, hiển thị lỗi, huỷ yêu cầu đang chờ ký, màn hình trạng thái.
- **Người viết:** canhphq@cas.so
- **Ngày:** 06/11/2026

## Chuẩn bị chung

- Mở trang CAS Sign trên Chrome máy tính (bản mới nhất), trang **Ký tài liệu**.
- Có điện thoại cài app **Cas ID**, đăng nhập bằng tài khoản người ký thử nghiệm có:
  - 1 chứng thư số **cá nhân**;
  - chứng thư số của **2 doanh nghiệp khác nhau**: DN A (MST `0123456789`) và DN B (MST `0312345678-001`). *Giả định: QA tự thay bằng MST thật của tài khoản thử nghiệm.*
- File mẫu: `hop_dong_2_trang.pdf` (2 trang, < 1 MB), `file_25MB.pdf` (> 20 MB), `anh.png` (không phải PDF).
- Tên gọi trên màn hình:
  - **Bước 1 – Thông tin ký**: CCCD, Tên tài liệu, Gửi từ, **Loại ký** (3 nút: *Tự chọn* / *Cá nhân* / *Doanh nghiệp*), **Mã số thuế** (chỉ hiện khi chọn *Doanh nghiệp*).
  - **Bước 2 – Tài liệu PDF**: ô chọn file; khi chọn một vùng ký sẽ hiện 3 nút *Chữ ký* / *Ký nháy* / *Con dấu*.
  - **Bước 3 – Đặt vị trí ký**: xem trước PDF, nút *Thêm vùng ký*.
  - **Thẻ trạng thái** ở cuối cột trái: *Đang chờ người ký* / *Đã ký hoàn tất* / *Người ký đã từ chối*.
- "Bản nháp hợp lệ" = đã tải `hop_dong_2_trang.pdf`, Tên tài liệu `Hợp đồng dịch vụ thử nghiệm`, Gửi từ `Cas Sign`, có 1 vùng ký mặc định ở trang 1.
- **Ưu tiên:** Cao = chặn luồng ký chính hoặc ký sai loại / sai doanh nghiệp; Trung bình = sai nhưng có cách khác; Thấp = hiển thị, hiếm gặp.

## Danh sách test case

### 1. Chọn loại ký

| Mã TC | Thuộc phần (UC) | Tình huống kiểm tra | Điều kiện trước | Các bước | Kết quả mong đợi | Ưu tiên |
| ----- | --------------- | ------------------- | --------------- | -------- | ---------------- | ------- |
| TC-LK-001 | A. Thêm field signType | Mặc định khi mở trang là "Tự chọn" | Chưa có phiên làm việc nào (bấm "Tạo yêu cầu mới" nếu có) | 1. Mở trang Ký tài liệu.<br>2. Nhìn mục Loại ký. | Nút *Tự chọn* đang được chọn. Dòng gợi ý: "Không gửi signType. Người ký tự chọn ký cá nhân hoặc doanh nghiệp trên Cas ID." Không có ô Mã số thuế. | Trung bình |
| TC-LK-002 | A. Thêm field signType | Chuyển qua lại 3 loại ký, gợi ý đổi theo | Bản nháp hợp lệ | 1. Bấm *Cá nhân*.<br>2. Bấm *Doanh nghiệp*.<br>3. Bấm *Tự chọn*. | B1: gợi ý "Bắt buộc ký bằng chứng thư cá nhân. Người ký không được đổi loại ký.", không có ô MST.<br>B2: gợi ý "Bắt buộc ký bằng chứng thư doanh nghiệp. Người ký không được đổi loại ký.", hiện ô Mã số thuế ghi "Không bắt buộc".<br>B3: ô MST biến mất. Chữ trên 3 nút không bị xuống dòng. | Trung bình |
| TC-LK-003 | A. signType – người ký tự chọn | "Tự chọn": người ký được chọn loại ký trên app | Bản nháp hợp lệ, Loại ký = *Tự chọn* | 1. Bấm *Gửi yêu cầu ký*.<br>2. Quét QR bằng Cas ID.<br>3. Trên app, xem các lựa chọn chứng thư. | App cho chọn cả chứng thư cá nhân và chứng thư doanh nghiệp. Ký bằng chứng thư cá nhân → web hiện "Đã ký hoàn tất" và bản PDF đã ký. | Cao |
| TC-LK-004 | A. signType = PERSONAL | "Cá nhân": người ký chỉ ký được bằng chứng thư cá nhân | Bản nháp hợp lệ, Loại ký = *Cá nhân* | 1. Gửi yêu cầu ký.<br>2. Quét QR bằng Cas ID.<br>3. Tìm cách đổi sang ký doanh nghiệp trên app. | App chỉ cho ký bằng chứng thư cá nhân, không có lựa chọn đổi loại ký. Ký xong → web hiện "Đã ký hoàn tất"; chữ ký trên PDF là chữ ký cá nhân. | Cao |
| TC-LK-005 | A. signType = BUSINESS, không có taxCode | "Doanh nghiệp" bỏ trống MST: ký được bằng chứng thư của bất kỳ doanh nghiệp nào | Bản nháp hợp lệ, Loại ký = *Doanh nghiệp*, ô MST để trống | 1. Xem dòng gợi ý dưới ô MST.<br>2. Gửi yêu cầu, quét QR.<br>3. Trên app chọn chứng thư DN B rồi ký. | B1: gợi ý "Để trống: người ký dùng chứng thư số của bất kỳ doanh nghiệp nào họ có."<br>B3: app chỉ cho ký bằng chứng thư doanh nghiệp (cả DN A và DN B), không cho ký cá nhân. Ký bằng DN B thành công; PDF hiện chữ ký của DN B. | Cao |
| TC-LK-006 | A. taxCode đổi ý nghĩa | Có MST: bắt buộc ký bằng chứng thư của đúng doanh nghiệp đó | Loại ký = *Doanh nghiệp*, MST `0123456789` (DN A) | 1. Xem dòng gợi ý dưới ô MST.<br>2. Gửi yêu cầu, quét QR.<br>3. Trên app thử chọn chứng thư DN B.<br>4. Chọn chứng thư DN A rồi ký. | B1: gợi ý "Người ký bắt buộc dùng chứng thư số của doanh nghiệp có MST 0123456789."<br>B3: app không cho ký bằng DN B (không hiện, hoặc báo không đúng doanh nghiệp).<br>B4: ký thành công, PDF hiện chữ ký của DN A. | Cao |
| TC-LK-007 | A. taxCode đổi ý nghĩa | MST có đuôi chi nhánh vẫn khớp đúng chi nhánh | Loại ký = *Doanh nghiệp*, MST `0312345678-001` (DN B) | 1. Gửi yêu cầu, quét QR.<br>2. Ký bằng chứng thư DN B. | Ký thành công bằng DN B; app không cho chọn DN A. | Trung bình |
| TC-LK-008 | A. taxCode không còn mặc định là ký cá nhân | Đã nhập MST rồi chuyển sang "Cá nhân": MST không được gửi đi | Loại ký = *Doanh nghiệp*, đã nhập MST `0123456789` | 1. Bấm *Cá nhân*.<br>2. Gửi yêu cầu, quét QR. | Ô MST ẩn. Trên app chỉ ký được bằng chứng thư cá nhân (không bị ép ký DN A). | Cao |
| TC-LK-009 | A. taxCode | Quay lại "Doanh nghiệp" thì MST đã nhập vẫn còn | Như TC-LK-008, sau bước 1 | 1. Bấm lại *Doanh nghiệp*. | Ô MST hiện lại với giá trị `0123456789`, gợi ý nhắc đúng MST này. | Thấp |
| TC-LK-010 | A. Người ký không được đổi loại ký | Không đổi được loại ký sau khi đã gửi | Đã gửi yêu cầu với Loại ký = *Cá nhân*, đang chờ ký | 1. Thử bấm *Doanh nghiệp* trên web.<br>2. Thử sửa CCCD, Gửi từ, Tên tài liệu. | Cả 3 nút loại ký và mọi ô nhập đều bị khoá (mờ, không bấm/gõ được). | Trung bình |

### 2. Mã số thuế

| Mã TC | Thuộc phần (UC) | Tình huống kiểm tra | Điều kiện trước | Các bước | Kết quả mong đợi | Ưu tiên |
| ----- | --------------- | ------------------- | --------------- | -------- | ---------------- | ------- |
| TC-MST-001 | B. Lỗi format input (taxCode) | MST thiếu 1 số (9 số) bị chặn ngay trên màn hình | Bản nháp hợp lệ, Loại ký = *Doanh nghiệp* | 1. Gõ `012345678` vào ô MST.<br>2. Bấm ra ngoài ô. | Ô MST viền đỏ; dưới ô báo "Mã số thuế gồm 10 số hoặc 10 số-3 số (VD: 0123456789-001)." Nút *Gửi yêu cầu ký* bị mờ. | Cao |
| TC-MST-002 | B. Lỗi format input (taxCode) | MST thừa 1 số (11 số) bị chặn | Như TC-MST-001 | 1. Gõ `01234567890`, bấm ra ngoài. | Báo lỗi như TC-MST-001; không gửi được. | Trung bình |
| TC-MST-003 | B. Lỗi format input (taxCode) | Đuôi chi nhánh sai độ dài (2 số) bị chặn | Như TC-MST-001 | 1. Gõ `0123456789-01`, bấm ra ngoài. | Báo lỗi như TC-MST-001. | Trung bình |
| TC-MST-004 | B. Lỗi format input (taxCode) | MST có chữ / ký tự lạ bị chặn | Như TC-MST-001 | 1. Gõ lần lượt `01234567AB`, `0123 456789`, `<script>alert(1)</script>`; mỗi lần bấm ra ngoài. | Cả 3 lần đều báo lỗi định dạng; không có hộp thoại bật lên; không gửi được. | Trung bình |
| TC-MST-005 | A. taxCode không bắt buộc | Xoá trắng MST thì vẫn gửi được | Ô MST đang báo lỗi (TC-MST-001) | 1. Xoá hết nội dung ô MST. | Hết báo lỗi, nút *Gửi yêu cầu ký* bấm được; gợi ý đổi về "Để trống: …". | Trung bình |
| TC-MST-006 | A. taxCode | Dấu cách thừa ở đầu/cuối MST được bỏ qua | Loại ký = *Doanh nghiệp* | 1. Gõ `␣0123456789␣` (có dấu cách hai đầu).<br>2. Gửi yêu cầu, quét QR. | Không báo lỗi; gợi ý hiện "…MST 0123456789". Trên app chỉ ký được bằng DN A. | Thấp |
| TC-MST-007 | B. Lỗi nghiệp vụ | MST đúng định dạng nhưng người ký không có chứng thư của doanh nghiệp đó | Loại ký = *Doanh nghiệp*, MST `0109999999` (DN mà tài khoản thử nghiệm KHÔNG có) | 1. Gửi yêu cầu.<br>2. Đọc khung lỗi. | Web báo lỗi đỏ **ngay khi gửi**: "Không tìm thấy doanh nghiệp theo mã số thuế" (MST không thuộc người ký) hoặc "Người ký chưa có chứng thư số phù hợp" (DN có nhưng chưa có CTS), kèm gợi ý cách sửa, mã lỗi, mã yêu cầu; ô MST viền đỏ. Sửa MST thì hết viền đỏ. | Cao |

### 3. Vùng ký (signatureFields)

| Mã TC | Thuộc phần (UC) | Tình huống kiểm tra | Điều kiện trước | Các bước | Kết quả mong đợi | Ưu tiên |
| ----- | --------------- | ------------------- | --------------- | -------- | ---------------- | ------- |
| TC-VK-001 | B. signatureFields – ít nhất 1 phần tử | Xoá hết vùng ký thì không gửi được | Bản nháp hợp lệ | 1. Bấm dấu ✕ trên vùng ký duy nhất. | Không còn vùng ký nào; dưới nút gửi báo "Cần đặt ít nhất một vùng ký."; nút *Gửi yêu cầu ký* bị mờ. | Cao |
| TC-VK-002 | B. signatureFields – không tràn trang | Kéo vùng ký sát góc phải dưới cùng của trang vẫn gửi được | Bản nháp hợp lệ | 1. Kéo vùng ký ra hết cỡ về góc phải dưới trang 1 (vùng ký không thể ra ngoài trang).<br>2. Gửi yêu cầu, ký trên app. | Gửi thành công, không báo "Vùng ký không hợp lệ". Trên PDF đã ký, chữ ký nằm sát góc phải dưới, không bị cắt. | Cao |
| TC-VK-003 | B. signatureFields – không tràn trang | Phóng to vùng ký hết cỡ sang phải vẫn gửi được | Bản nháp hợp lệ | 1. Kéo chấm ở góc phải dưới của vùng ký sang phải hết cỡ.<br>2. Gửi yêu cầu. | Vùng ký dừng ở mép phải trang. Gửi thành công. | Trung bình |
| TC-VK-004 | B. signatureFields – page ≥ 1 | Nhiều vùng ký trên nhiều trang đều được ký đúng chỗ | Bản nháp hợp lệ | 1. Ở trang 1 giữ 1 vùng ký góc trên trái.<br>2. Chọn "Trang 2", bấm *Thêm vùng ký*, kéo vào giữa trang 2.<br>3. Gửi, ký trên app. | Ô "vùng" hiện 2. Trên PDF đã ký có 2 chữ ký đúng vị trí đã đặt ở trang 1 và trang 2. | Cao |
| TC-VK-005 | B. fieldType mặc định SIGNATURE | Vùng ký mới mặc định là "Chữ ký" | Bản nháp hợp lệ | 1. Bấm vào vùng ký 1. | Khung chỉnh vùng ký hiện; nút *Chữ ký* đang được chọn; vùng ký trên PDF ghi "Chữ ký 1", khung xanh lá. | Trung bình |
| TC-VK-006 | B. fieldType SIGNATURE / INITIAL / STAMP | Đổi loại vùng ký sang "Ký nháy" và "Con dấu" | Bản nháp có 3 vùng ký | 1. Vùng 1 giữ *Chữ ký*.<br>2. Chọn vùng 2 → bấm *Ký nháy*.<br>3. Chọn vùng 3 → bấm *Con dấu*.<br>4. Gửi, ký trên app. | B2: vùng 2 ghi "Ký nháy 2", khung xanh dương. B3: vùng 3 ghi "Con dấu 3", khung đỏ nét đứt. B4: gửi thành công; PDF đã ký thể hiện đúng loại từng vùng *(cách hiển thị: xem Câu hỏi 3)*. | Cao |
| TC-VK-007 | B. fieldType | Loại vùng ký được giữ sau khi tải lại trang | Đã làm xong bước 3 của TC-VK-006, chưa gửi | 1. Bấm tải lại trang (F5). | 3 vùng ký vẫn ở đúng vị trí, đúng loại (Chữ ký / Ký nháy / Con dấu). | Thấp |
| TC-VK-008 | B. signatureFields | Không chỉnh được vùng ký khi đang chờ ký | Đã gửi, đang chờ ký | 1. Thử kéo, phóng to, xoá vùng ký trên PDF. | Vùng ký không di chuyển, không đổi kích thước, không có nút ✕; khung chỉnh loại vùng ký không hiện. | Trung bình |

### 4. Hiển thị lỗi khi gửi

| Mã TC | Thuộc phần (UC) | Tình huống kiểm tra | Điều kiện trước | Các bước | Kết quả mong đợi | Ưu tiên |
| ----- | --------------- | ------------------- | --------------- | -------- | ---------------- | ------- |
| TC-LOI-001 | B. Lỗi trả về – có mã lỗi và mã yêu cầu | Lỗi từ hệ thống ký hiện rõ mã lỗi và mã yêu cầu để báo lại | Có một lỗi bị hệ thống ký từ chối (ví dụ TC-MST-007 phương án a) | 1. Gửi yêu cầu.<br>2. Đọc khung lỗi đỏ.<br>3. Bấm vào mã yêu cầu trong khung lỗi, dán vào Notepad. | Khung đỏ có: tiêu đề lỗi tiếng Việt, nội dung chi tiết, mã lỗi, mã yêu cầu dạng `CAS-…`. Mã dán ra khớp mã trên màn hình. Thẻ trạng thái góc trên ghi "Cần kiểm tra". | Cao |
| TC-LOI-002 | B. INVALID_PARAM – nhiều lỗi ghép bằng dấu phẩy | Nhiều lỗi định dạng được hiện thành từng dòng riêng | *Giả định: dev/QA kỹ thuật tạo sẵn tình huống hệ thống ký trả lỗi định dạng có 2 lỗi* | 1. Gửi yêu cầu.<br>2. Đọc khung lỗi. | Tiêu đề "Dữ liệu gửi lên chưa đúng định dạng"; bên dưới có 2 gạch đầu dòng, mỗi lỗi một dòng (không dồn chung một dòng có dấu phẩy); có mã `INVALID_PARAM`. | Trung bình |
| TC-LOI-003 | B. E_SIGN_SIGNATURE_FIELDS_INVALID | Lỗi vùng ký có hướng dẫn sửa | *Giả định như TC-LOI-002, lỗi vùng ký không hợp lệ* | 1. Gửi yêu cầu.<br>2. Đọc khung lỗi. | Tiêu đề "Vùng ký không hợp lệ"; có dòng "Kiểm tra lại vị trí và kích thước các vùng ký ở Bước 3: khung ký phải nằm trọn trong trang."; có mã `E_SIGN_SIGNATURE_FIELDS_INVALID`. | Trung bình |
| TC-LOI-004 | B. Lỗi trả về | Sau khi gặp lỗi vẫn sửa và gửi lại được | Đang hiện khung lỗi đỏ | 1. Sửa thông tin (ví dụ đổi Loại ký sang *Tự chọn*).<br>2. Bấm *Gửi yêu cầu ký*. | Gửi lại được, không cần tải lại file; khung lỗi cũ biến mất; chuyển sang thẻ "Đang chờ người ký" với mã yêu cầu mới. | Cao |
| TC-LOI-005 | Ngoại lệ – mất mạng | Mất mạng lúc gửi | Bản nháp hợp lệ | 1. Tắt Wi-Fi.<br>2. Bấm *Gửi yêu cầu ký*.<br>3. Bật Wi-Fi, bấm gửi lại. | B2: hiện khung lỗi đỏ dễ hiểu; file, vùng ký và thông tin vẫn còn nguyên. B3: gửi thành công. | Trung bình |
| TC-LOI-006 | Validate trên màn hình | File không phải PDF hoặc quá 20 MB bị từ chối | Chưa tải file | 1. Chọn `anh.png`.<br>2. Chọn `file_25MB.pdf`. | B1: báo "Vui lòng chọn đúng định dạng PDF." B2: báo "File PDF không được vượt quá 20 MB." Cả hai lần không có file nào được nhận. | Trung bình |

### 5. Chờ ký, huỷ yêu cầu và kết quả

| Mã TC | Thuộc phần (UC) | Tình huống kiểm tra | Điều kiện trước | Các bước | Kết quả mong đợi | Ưu tiên |
| ----- | --------------- | ------------------- | --------------- | -------- | ---------------- | ------- |
| TC-CHO-001 | Trạng thái chờ ký | Sau khi gửi chỉ có một hành động chính | Bản nháp hợp lệ | 1. Bấm *Gửi yêu cầu ký*.<br>2. Đóng popup QR.<br>3. Xem cột trái. | B1: popup QR tự bật. B3: chỉ còn thẻ "Đang chờ người ký" gồm mã yêu cầu, nút *Hiện mã QR để ký*, chữ "Huỷ yêu cầu", nút làm mới nhỏ. Không còn nút *Gửi yêu cầu ký*. | Cao |
| TC-CHO-002 | Trạng thái chờ ký | Popup QR: đóng / mở lại / sao chép link | Đang chờ ký | 1. Bấm *Hiện mã QR để ký*.<br>2. Bấm "Sao chép link ký", dán vào Notepad.<br>3. Bấm phím Esc.<br>4. Mở lại, bấm ra vùng tối bên ngoài popup. | B1: popup chỉ có mã QR, hướng dẫn "Mở app Cas ID và quét mã bên dưới", dòng trạng thái, 2 đường link nhỏ. B2: chữ đổi thành "Đã sao chép", dán ra được đường link ký. B3, B4: popup đóng. | Trung bình |
| TC-CHO-003 | Trạng thái chờ ký | Ký xong thì trang tự cập nhật, không phải bấm gì | Đang chờ ký, chấm trạng thái màu xanh, ghi "Trang sẽ tự cập nhật khi ký xong" | 1. Ký trên Cas ID.<br>2. Không thao tác gì trên web, chờ tối đa 30 giây. | Web tự chuyển sang "Đã ký hoàn tất"; popup QR tự đóng; PDF bên phải đổi thành bản đã ký. | Cao |
| TC-CHO-004 | Trạng thái chờ ký | Kiểm tra thủ công khi chưa ký | Đang chờ ký, chưa ký trên app | 1. Bấm nút làm mới (⟳) trên thẻ trạng thái. | Biểu tượng xoay trong lúc kiểm tra; sau đó hiện "Chưa có kết quả ký · kiểm tra lúc HH:MM:SS"; vẫn ở trạng thái chờ ký. | Trung bình |
| TC-CHO-005 | Trạng thái chờ ký | Tải lại trang khi đang chờ ký không mất yêu cầu | Đang chờ ký | 1. Bấm F5.<br>2. Ký trên app. | B1: vẫn là thẻ "Đang chờ người ký", đúng mã yêu cầu, Loại ký và MST giữ nguyên. B2: trang cập nhật "Đã ký hoàn tất". | Cao |
| TC-HUY-001 | Huỷ yêu cầu | Huỷ và giữ lại tài liệu để gửi lại | Đang chờ ký | 1. Bấm "Huỷ yêu cầu".<br>2. Giữ tick "Giữ lại tài liệu và vùng ký để chỉnh sửa, gửi lại".<br>3. Bấm *Huỷ yêu cầu* (nút đỏ). | B1: hộp xác nhận "Huỷ yêu cầu này?", có cảnh báo mã QR cũ có thể vẫn ký được; chỉ có 2 nút *Huỷ yêu cầu* và *Không*. B3: về bản nháp, hiện "Đã huỷ yêu cầu ký."; file, thông tin, loại ký, vùng ký còn nguyên và sửa được. | Cao |
| TC-HUY-002 | Huỷ yêu cầu | Huỷ và xoá sạch để tạo yêu cầu mới | Đang chờ ký | 1. Bấm "Huỷ yêu cầu".<br>2. Bỏ tick "Giữ lại…".<br>3. Bấm *Huỷ yêu cầu*.<br>4. Bấm F5. | B3: màn hình trống như mới mở, chưa có file, Loại ký = *Tự chọn*. B4: vẫn trống (không hiện lại yêu cầu cũ). | Cao |
| TC-HUY-003 | Huỷ yêu cầu | Bấm "Không" thì vẫn tiếp tục chờ | Đang mở hộp xác nhận huỷ | 1. Bấm *Không*.<br>2. Ký trên app. | B1: hộp xác nhận đóng, vẫn chờ ký, mã yêu cầu không đổi. B2: trang cập nhật "Đã ký hoàn tất". | Trung bình |
| TC-HUY-004 | Huỷ yêu cầu | Quét QR cũ sau khi đã huỷ | Đã làm TC-HUY-001 nhưng vẫn giữ mã QR cũ (chụp lại trước khi huỷ) | 1. Dùng Cas ID quét mã QR cũ và ký. | *Theo thiết kế hiện tại (xem Câu hỏi 1):* trang web không đổi trạng thái, vẫn là bản nháp. Ghi nhận app có cho ký hay không. | Trung bình |
| TC-KQ-001 | Kết quả – ký hoàn tất | Màn hình ký xong và tải file | Vừa ký xong | 1. Xem thẻ trạng thái.<br>2. Bấm *Tải file đã ký*.<br>3. Mở file vừa tải. | B1: "Đã ký hoàn tất", "Ký lúc …" đúng giờ ký, mã yêu cầu. Chỉ một nút chính *Tải file đã ký* và chữ "Tạo yêu cầu mới". B3: tên file dạng `<ten_file_goc>_signed.pdf` (VD `hop_dong_2_trang_signed.pdf`); file có chữ ký đúng loại đã chọn (cá nhân / đúng doanh nghiệp). | Cao |
| TC-KQ-002 | Kết quả – ký hoàn tất | Tạo yêu cầu mới sau khi ký xong | Đang ở màn hình ký hoàn tất | 1. Bấm "Tạo yêu cầu mới". | Màn hình trống, Loại ký về *Tự chọn*, ô MST trống, có thể tải file mới. | Trung bình |
| TC-KQ-003 | Kết quả – từ chối | Người ký từ chối, có lý do | Đang chờ ký | 1. Trên Cas ID bấm từ chối, nhập lý do `Sai nội dung điều 3`. | Web hiện "Người ký đã từ chối", kèm lý do "Sai nội dung điều 3", mã yêu cầu. Nút chính *Chỉnh sửa & gửi lại*, chữ "Tạo yêu cầu mới". | Cao |
| TC-KQ-004 | Kết quả – từ chối | Chỉnh sửa và gửi lại sau khi bị từ chối | Đang ở màn hình TC-KQ-003 | 1. Bấm *Chỉnh sửa & gửi lại*.<br>2. Kéo vùng ký sang vị trí khác, gửi lại. | B1: về bản nháp, giữ nguyên file, thông tin, loại ký, vùng ký; sửa được. B2: gửi thành công với mã yêu cầu mới. | Cao |

## Không áp dụng

- Phân quyền: không áp dụng — trang UAT không có đăng nhập/phân vai.
- Đa ngôn ngữ: không áp dụng — giao diện chỉ có tiếng Việt.

## Câu hỏi cần PO trả lời

1. **Huỷ yêu cầu:** hệ thống ký chưa có chức năng huỷ, nên "Huỷ" hiện chỉ có tác dụng trên trang web. Mã QR cũ vẫn ký được. Có chấp nhận như vậy không, hay cần thêm chức năng huỷ phía hệ thống ký?
2. ~~MST mà người ký không có chứng thư báo lỗi ở đâu?~~ Đã rõ khi test ngày 06/11/2026: báo ngay lúc gửi (`E_SIGN_CERTIFICATE_NOT_FOUND`, `E_SIGN_BUSINESS_NOT_FOUND`). Cần bổ sung 2 mã lỗi này vào spec.
3. **Ký nháy / Con dấu:** trên PDF đã ký, hai loại này hiển thị khác chữ ký thường như thế nào? App có yêu cầu người ký thao tác khác không?
4. **"Tự chọn" (không gửi loại ký):** đúng là người ký được chọn cá nhân hoặc doanh nghiệp trên app? Spec chỉ nói "loại ký do signType quyết định", không nói trường hợp bỏ trống.
5. **Loại ký = Doanh nghiệp nhưng người ký không có chứng thư doanh nghiệp nào:** kỳ vọng hiển thị gì?
6. Đối tác có cần gửi MST khi chọn *Tự chọn* không? Hiện màn hình chỉ cho nhập MST khi chọn *Doanh nghiệp*.

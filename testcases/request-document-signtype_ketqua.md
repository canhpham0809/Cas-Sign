# Kết quả kiểm thử: Loại ký (signType), mã số thuế, vùng ký — CAS Sign

- **Bộ test case:** [request-document-signtype_testcases.md](request-document-signtype_testcases.md)
- **Ngày chạy:** 06/11/2026
- **Môi trường:** web chạy local (`localhost:3000`) gọi API **sandbox**; app Cas ID sandbox trên máy ảo Android `cas_pixel`, tài khoản PHAM HOANG QUANG CANH (CCCD 056099004785)
- **Dữ liệu của tài khoản thử:**

| Định danh | MST | Chứng thư số |
|---|---|---|
| Cá nhân | — | Có (CMC CA) |
| TND FOOD | 0111647603 | Có (Intrust CA) |
| FPT | 0101778163 | **Không có** |

- **Cách chạy:** trình duyệt tự động thao tác trên web (Chrome headless) + điều khiển app trên máy ảo + ký thật bằng PIN.

## Tổng hợp

| Kết quả | Số case |
|---|---|
| ✅ Đạt | 39 / 44 |
| ⚠️ Đạt một phần / cần PO quyết | 3 (TC-LK-005, TC-VK-006, TC-KQ-003) |
| 🔁 Chưa test được, cần anh/chị test | 2 (TC-CHO-003, TC-LK-007) |
| ❌ Còn lỗi | 0 (7 lỗi tìm thấy đã sửa và chạy lại đạt, xem mục Lỗi) |

## Kết quả từng case

| Mã TC | Kết quả | Ghi chú / bằng chứng |
|---|---|---|
| TC-LK-001 | ✅ | Mặc định "Tự chọn", đúng câu gợi ý, không có ô MST |
| TC-LK-002 | ✅ | Gợi ý đổi đúng theo từng loại; 3 nút không xuống dòng ở cả màn rộng 1440 và 1024 |
| TC-LK-003 | ✅ | App hỏi "Bạn muốn ký bằng định danh nào?", cho chọn **TND (Doanh nghiệp)** hoặc **Cá nhân**. FPT không hiện vì chưa có CTS. Ký cá nhân thành công |
| TC-LK-004 | ✅ | App không hỏi định danh, chỉ cho chọn chứng thư cá nhân. Ký thành công |
| TC-LK-005 | ⚠️ | App chỉ cho ký bằng CTS TND, không cho ký cá nhân. **Chưa kiểm được ý "bất kỳ doanh nghiệp nào"** vì tài khoản chỉ có 1 doanh nghiệp có CTS |
| TC-LK-006 | ✅ | MST TND: app chỉ cho chọn CTS TND. PDF đã ký có dấu đỏ TND FOOD + MST 0111647603 |
| TC-LK-007 | 🔁 | Tài khoản thử không có doanh nghiệp nào có MST đuôi chi nhánh (`-001`) |
| TC-LK-008 | ✅ | Chuyển từ Doanh nghiệp (đã nhập MST) sang Cá nhân: gửi đi đúng loại Cá nhân, **không** kèm MST |
| TC-LK-009 | ✅ | Quay lại Doanh nghiệp: MST `0123456789` còn nguyên |
| TC-LK-010 | ✅ | Đang chờ ký: 3 nút loại ký và mọi ô nhập đều bị khoá |
| TC-MST-001..004 | ✅ | 9 số, 11 số, `0123456789-01`, có chữ, có dấu cách, `<script>`: đều báo "Mã số thuế gồm 10 số hoặc 10 số-3 số…", nút Gửi mờ, không có hộp thoại lạ |
| TC-MST-005 | ✅ | Xoá trắng MST thì hết lỗi, gửi được, gợi ý "Để trống: …" |
| TC-MST-006 | ✅ | `␣0123456789␣` gửi đi thành `0111647603` (đã bỏ dấu cách), không báo lỗi |
| TC-MST-007 | ✅ (sau khi sửa) | Hệ thống báo lỗi **ngay khi gửi**: FPT trả `E_SIGN_CERTIFICATE_NOT_FOUND`, MST lạ `0109999999` trả `E_SIGN_BUSINESS_NOT_FOUND`. Màn hình hiện tiêu đề dễ hiểu, gợi ý cách sửa, ô MST viền đỏ |
| TC-VK-001 | ✅ | "Cần đặt ít nhất một vùng ký.", nút Gửi mờ |
| TC-VK-002 | ✅ | Kéo sát góc phải dưới, gửi thành công. Trên PDF đã ký, chữ ký nằm đúng góc và không bị cắt |
| TC-VK-003 | ✅ | Phóng to hết cỡ: mép vùng ký trùng mép trang, gửi thành công |
| TC-VK-004 | ✅ | 3 vùng trên 2 trang: app báo "0/3 vị trí ký", PDF có 3 chữ ký đúng chỗ |
| TC-VK-005 | ✅ | Mặc định "Chữ ký", nhãn "Chữ ký 1" |
| TC-VK-006 | ⚠️ | Web gửi đúng loại Chữ ký / Ký nháy / Con dấu. Nhưng **app và PDF đã ký hiển thị cả 3 giống hệt chữ ký thường** → cần PO (Câu hỏi 3) |
| TC-VK-007 | ✅ | F5 xong, 3 vùng giữ đúng vị trí và loại |
| TC-VK-008 | ✅ | Đang chờ ký: không kéo được, không có nút ✕, không hiện khung chỉnh loại |
| TC-LOI-001 | ✅ | Lỗi thật từ hệ thống: có tiêu đề, chi tiết, mã lỗi, mã yêu cầu (bấm để copy), thẻ trạng thái "Cần kiểm tra" |
| TC-LOI-002 | ✅ (mô phỏng) | Lỗi định dạng có 2 lỗi được tách thành 2 dòng. Đã kiểm thêm trên sandbox: lỗi thật đúng dạng "signType không hợp lệ, documentName không được để trống" |
| TC-LOI-003 | ✅ (mô phỏng) | "Vùng ký không hợp lệ" + hướng dẫn sửa ở Bước 3 |
| TC-LOI-004 | ✅ | Sửa xong gửi lại được, khung lỗi cũ mất, ra mã yêu cầu mới |
| TC-LOI-005 | ✅ (sau khi sửa) | Mất mạng: thông báo tiếng Việt, file và thông tin giữ nguyên; có mạng lại gửi thành công |
| TC-LOI-006 | ✅ | PNG và file 25 MB bị từ chối đúng thông báo |
| TC-CHO-001 | ✅ | Gửi xong popup QR tự bật; thẻ chờ ký chỉ có 1 nút chính, không còn nút Gửi, không có thông báo trùng |
| TC-CHO-002 | ✅ | Popup: copy link đúng, đóng được bằng Esc và bằng cách bấm ra ngoài |
| TC-CHO-003 | 🔁 | **Không kiểm được trên local**: webhook của sandbox gửi về URL đã deploy, không về `localhost`. Màn hình ghi đúng "Bấm làm mới để kiểm tra kết quả ký" (không hứa tự cập nhật) |
| TC-CHO-004 | ✅ | Bấm ⟳ hiện "Chưa có kết quả ký (NEW) · kiểm tra lúc 15:10:23" |
| TC-CHO-005 | ✅ (sau khi sửa) | F5 khi đang chờ ký: giữ mã yêu cầu, loại ký Doanh nghiệp và MST |
| TC-HUY-001 | ✅ | Hộp xác nhận chỉ 2 nút, có cảnh báo QR cũ; huỷ xong giữ file, vùng ký, loại ký |
| TC-HUY-002 | ✅ (sau khi sửa) | Bỏ tick "Giữ lại": màn hình trống, loại ký về "Tự chọn", F5 vẫn trống |
| TC-HUY-003 | ✅ | Bấm "Không": vẫn chờ, mã yêu cầu không đổi |
| TC-HUY-004 | ✅ | Sau khi huỷ trên web, app **vẫn ký được** yêu cầu cũ (hệ thống ghi COMPLETED), còn web vẫn ở "Bản nháp". Đúng như cảnh báo, xem Câu hỏi 1 |
| TC-KQ-001 | ✅ | "Đã ký hoàn tất", giờ ký đúng (sau khi sửa), tải file được. Tên file lấy theo **tên file gốc**: `hop_dong_2_trang_signed.pdf` |
| TC-KQ-002 | ✅ | Cùng chức năng "Tạo yêu cầu mới" như TC-HUY-002 |
| TC-KQ-003 | ⚠️ | Từ chối trên app (lý do "Sai noi dung dieu 3"): web hiện "Người ký đã từ chối" nhưng **không có lý do**, vì API tra trạng thái của sandbox không trả về lý do. Khi hệ thống có trả lý do (mô phỏng), web hiện đúng "Lý do: Sai nội dung điều 3" |
| TC-KQ-004 | ✅ | "Chỉnh sửa & gửi lại": giữ file, vùng ký, loại ký; gửi lại ra mã mới |

## Kiểm tra API trực tiếp (dev/QA kỹ thuật)

Gọi thẳng sandbox với dữ liệu sai, những dữ liệu mà giao diện không cho tạo ra. Cả 16 case đều đúng spec.

| # | Dữ liệu gửi | Kết quả sandbox |
|---|---|---|
| 01–02 | `signatureFields` = `[]` / không phải JSON | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |
| 03–04 | `page` = 0 / 1.5 | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |
| 05 | `xRatio` = 1.2 | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |
| 06–07 | x+w = 1.1 / y+h = 1.05 | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |
| 08 | thiếu `heightRatio` | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |
| 09 | `fieldType` = `stamp` (chữ thường) | 200, nhận |
| 10 | `fieldType` = `FOO` | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |
| 11 | không có `fieldType` | 200, nhận |
| 12 | x+w = 1 (đúng biên) | 200, nhận |
| 13–14 | `signType` = `ABC` / `personal` | 400 `INVALID_PARAM` "signType không hợp lệ" |
| 15 | `signType` sai + thiếu `documentName` | 400 `INVALID_PARAM` "signType không hợp lệ, documentName không được để trống" |
| 16 | `page` = 5 (PDF chỉ 2 trang) | 400 `E_SIGN_SIGNATURE_FIELDS_INVALID` |

Ghi chú:
- Lỗi vùng ký của sandbox chỉ trả câu chung "Các trường chữ ký không hợp lệ", không nói sai ở vùng nào. Proxy của mình kiểm trước nên trả lỗi cụ thể hơn (ví dụ "Vùng ký 1: tràn ngang ra ngoài trang").
- Sandbox giới hạn khoảng 5 request trong thời gian ngắn và trả HTTP 429.

## Lỗi tìm thấy và đã sửa (chạy lại đều đạt)

| # | Lỗi | Case | Sửa |
|---|---|---|---|
| 1 | Chọn loại ký rồi gõ MST ngay thì F5 mất loại ký: hai lần lưu phiên chạy song song ghi đè nhau | TC-CHO-005 | Lưu phiên chạy tuần tự (`app/session-storage.ts`) |
| 2 | "Tạo yêu cầu mới" không đưa loại ký về "Tự chọn" | TC-HUY-002 | `createNewRequest` reset `signType` |
| 3 | Lỗi MST không có CTS / không tìm thấy DN hiện tiêu đề kỹ thuật "Yêu cầu bị từ chối (GRANT_ERROR)" | TC-MST-007 | Thêm 2 mã lỗi mới, tiêu đề và gợi ý tiếng Việt, tô đỏ ô MST |
| 4 | Giờ ký hiện lệch **+7 tiếng** (22:07 thay vì 15:07) khi trạng thái lấy từ bộ nhớ đệm | TC-KQ-001 | Worker lưu thêm `signedAt`, không phải dùng `lastUpdatedAt` |
| 5 | Mất mạng hiện "Failed to fetch" | TC-LOI-005 | Thông báo tiếng Việt, nói rõ thông tin vẫn giữ |
| 6 | Bị từ chối mà không có lý do thì hiện "Không có lý do kèm theo" (sai, người ký có nhập lý do) | TC-KQ-003 | Đổi thành "Hệ thống ký chưa trả về lý do từ chối." |
| 7 | HTTP 429 hiện câu tiếng Anh | API | Thông báo tiếng Việt |

Lỗi phía **sandbox** (báo team backend): `lastUpdatedAt` trả giờ Việt Nam nhưng gắn hậu tố `Z` (UTC), ví dụ ký lúc 15:07 thì trả `15:07:53.000Z`, còn `signedAt` đúng là `08:07:53Z`.

## Phần cần anh/chị test

### 1. TC-CHO-003: web tự cập nhật khi ký xong (môi trường deploy)
1. Deploy nhánh hiện tại lên môi trường đã đăng ký webhook với sandbox.
2. Mở trang Ký tài liệu trên URL deploy. Nhập CCCD `056099004785`, tải PDF bất kỳ, Loại ký = Cá nhân, bấm Gửi.
3. Kiểm tra: thẻ chờ ký có **chấm xanh nhấp nháy** và dòng "Trang sẽ tự cập nhật khi ký xong".
4. Trên Cas ID: Yêu cầu ký số → hồ sơ PHAM HOANG QUANG CANH → kéo xuống để làm mới → mở yêu cầu → Chạm để ký → Ký số → chọn CTS → PIN.
5. **Không bấm gì trên web**, chờ tối đa 30 giây.
6. Đạt nếu: web tự chuyển "Đã ký hoàn tất", popup QR tự đóng, PDF đổi sang bản đã ký, giờ ký đúng.

### 2. TC-KQ-003: lý do từ chối qua webhook (môi trường deploy)
1. Làm bước 1–3 ở trên.
2. Trên Cas ID mở yêu cầu → Từ chối → nhập `Sai nội dung điều 3` → Gửi từ chối.
3. Đạt nếu web tự chuyển "Người ký đã từ chối" và hiện **"Lý do: Sai nội dung điều 3"**. Nếu hiện "Hệ thống ký chưa trả về lý do từ chối." thì webhook cũng không gửi lý do → báo backend.

### 3. TC-LK-005 và TC-LK-007: cần thêm dữ liệu
- **TC-LK-005**: cần tài khoản có CTS của **≥ 2 doanh nghiệp** (ví dụ đăng ký thêm CTS cho FPT). Gửi Loại ký = Doanh nghiệp, MST để trống. Đạt nếu app cho chọn CTS của cả 2 doanh nghiệp, không cho ký cá nhân.
- **TC-LK-007**: cần doanh nghiệp có MST đuôi chi nhánh (dạng `0312345678-001`) và CTS của chi nhánh đó. Gửi Doanh nghiệp + MST đó. Đạt nếu app chỉ cho chọn CTS của chi nhánh.

## Câu hỏi cho PO (cập nhật)

1. **Huỷ yêu cầu**: đã xác nhận app vẫn ký được yêu cầu đã huỷ trên web (TC-HUY-004). Có cần backend bổ sung API huỷ không?
2. ~~MST không có CTS báo lỗi ở đâu~~ → **Đã rõ**: báo ngay lúc gửi (`E_SIGN_CERTIFICATE_NOT_FOUND`, `E_SIGN_BUSINESS_NOT_FOUND`). Cần bổ sung 2 mã lỗi này vào spec.
3. **Ký nháy / Con dấu**: app và PDF hiển thị giống chữ ký thường. Đây có phải hành vi mong muốn không?
4. **Tự chọn**: đã xác nhận người ký được chọn Cá nhân hoặc Doanh nghiệp trên app.
5. API tra trạng thái không trả lý do từ chối. Có cần bổ sung không?
6. Tên file tải về đang lấy theo tên file gốc, không theo "Tên tài liệu". Giữ như vậy hay đổi?

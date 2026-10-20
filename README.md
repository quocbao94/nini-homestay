# NiNi Homestay – mô hình 3D (Hồ Trị An, Đồng Nai)

Mô hình địa hình + công trình của khu homestay, dựng bằng Blender, xem trên web bằng Three.js.

## Cấu trúc
| Thư mục | Nội dung |
|---|---|
| `01_DiaHinh/` | DEM Copernicus 30 m (AAIGrid) – nguồn OpenTopography |
| `02_AnhVeTinh/` | Ảnh vệ tinh Esri World Imagery (bối cảnh z17, khu đất z18) |
| `04_Script/` | Script Python cho Blender: `san_leu.py` (mẫu sàn lều), `export_web.py` (xuất ra web) |
| `05_Texture/` | Texture lá cây, đất đã nướng |
| `web/` | Trang web 3D (tĩnh) – được GitHub Pages tự đăng khi push |
| `NiNi_Homestay.blend` | File Blender gốc |

## Hệ tọa độ
VN-UTM zone 48N (EPSG:32648). Gốc mô hình (0,0) = E 728496, N 1235724. Cao độ tuyệt đối (m).
Mực nước dâng bình thường hồ Trị An: 62 m; mực nước chết: 50 m.

## Cập nhật web
1. Sửa mô hình trong Blender, lưu file.
2. Chạy `04_Script/export_web.py` trong Blender (hoặc `blender -b NiNi_Homestay.blend -P 04_Script/export_web.py`), sau đó revert file (script tạm sửa vật liệu để xuất).
3. Commit + push → GitHub Actions đăng lại `web/`.

Xem nội bộ (có thanh trượt mực nước, đo cao độ): thêm `#noibo` vào cuối link.

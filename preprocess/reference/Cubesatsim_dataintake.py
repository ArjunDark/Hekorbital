import os
import cv2
import numpy as np
import matplotlib.pyplot as plt
from collections import deque

class CubeSatIngressModule:
    def __init__(self, sram_limit_mb=4.2, max_psram_slots=3):
        self.sram_limit_bytes = int(sram_limit_mb * 1024 * 1024)
        self.psram_ring_buffer = deque(maxlen=max_psram_slots)
        
    def process_sensor_frame(self, image_path, target_tensor_res=(160, 160)):
        # --- 1. Ingest: Read local image file ---
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"[ERROR] Image file not found at path: {image_path}")
            
        raw_img = cv2.imread(image_path)
        if raw_img is None:
            raise ValueError(f"[ERROR] Failed to decode image file: {image_path}")
            
        h, w, c = raw_img.shape
        raw_byte_size = raw_img.nbytes
        
        # --- 2. PSRAM Action: Stage raw frame in external ring buffer ---
        frame_id = f"CUBESAT_IMG_{np.random.randint(10000, 99999)}"
        psram_packet = {
            "id": frame_id,
            "filename": os.path.basename(image_path),
            "raw_data": raw_img,
            "original_resolution": (w, h),
            "size_bytes": raw_byte_size
        }
        self.psram_ring_buffer.append(psram_packet)
        
        print(f"\n[SENSOR INGRESS] Captured: {psram_packet['filename']} | Raw: {w}x{h} ({raw_byte_size / (1024*1024):.2f} MB)")
        
        # --- 3. Internal SRAM Action: Downscale & INT8 Formatting ---
        downscaled_img = cv2.resize(raw_img, target_tensor_res, interpolation=cv2.INTER_AREA)
        int8_tensor = np.clip(downscaled_img.astype(np.float32) - 128.0, -128, 127).astype(np.int8)
        tensor_byte_size = int8_tensor.nbytes
        
        if tensor_byte_size > self.sram_limit_bytes:
            raise MemoryError(f"[CRITICAL FAULT] Tensor size breaches internal SRAM limit!")
            
        print(f"[SRAM SCRATCHPAD] INT8 Tensor created ({tensor_byte_size / 1024:.2f} KB). Ready for TinyML.")
        
        # --- 4. Output: Clean payload package ---
        return {
            "frame_id": frame_id,
            "tensor": int8_tensor,
            "psram_reference": psram_packet
        }

    def visualize_memory_footprint(self, payload_package):
        """
        Uses Matplotlib to compare the PSRAM raw image and the Internal SRAM tensor view side-by-side.
        """
        psram_packet = payload_package["psram_reference"]
        int8_tensor = payload_package["tensor"]
        
        fig, axes = plt.subplots(1, 2, figsize=(12, 6))
        
        # 1. PSRAM Raw Image View (Convert OpenCV BGR to RGB for matplotlib)
        raw_rgb = cv2.cvtColor(psram_packet["raw_data"], cv2.COLOR_BGR2RGB)
        raw_mb = psram_packet["size_bytes"] / (1024 * 1024)
        orig_w, orig_h = psram_packet["original_resolution"]
        
        axes[0].imshow(raw_rgb)
        axes[0].set_title(f"1. External PSRAM Staging Buffer\nResolution: {orig_w}x{orig_h} | Footprint: {raw_mb:.2f} MB", fontsize=11, fontweight='bold')
        axes[0].axis('off')
        
        # 2. Internal SRAM Tensor View (De-quantize INT8 back to displayable 0-255 RGB range)
        tensor_view = np.clip(int8_tensor.astype(np.float32) + 128.0, 0, 255).astype(np.uint8)
        tensor_rgb = cv2.cvtColor(tensor_view, cv2.COLOR_BGR2RGB)
        tensor_kb = int8_tensor.nbytes / 1024
        
        axes[1].imshow(tensor_rgb)
        axes[1].set_title(f"2. Internal SRAM Scratchpad (TinyML Input)\nResolution: {tensor_rgb.shape[1]}x{tensor_rgb.shape[0]} | Footprint: {tensor_kb:.2f} KB (INT8)", fontsize=11, fontweight='bold')
        axes[1].axis('off')
        
        plt.suptitle("CubeSat Memory Emulation: PSRAM vs. Internal SRAM Scratchpad", fontsize=14, y=0.98)
        plt.tight_layout()
        plt.show()

# --- Test Execution ---
if __name__ == "__main__":
    module = CubeSatIngressModule(sram_limit_mb=4.2)
    
    # Generate test image if missing
    test_path = "sample_earth_path.jpg"
    if not os.path.exists(test_path):
        dummy_frame = np.random.randint(0, 255, (2048, 2048, 3), dtype=np.uint8)
        cv2.imwrite(test_path, dummy_frame)
        
    # Process and visualize
    payload = module.process_sensor_frame(test_path, target_tensor_res=(160, 160))
    module.visualize_memory_footprint(payload)
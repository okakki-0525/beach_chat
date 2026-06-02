import os
import subprocess

# ===== Aセクション：現在フォルダへ移動 =====
os.chdir(os.path.dirname(__file__))

# ===== Bセクション：Flask起動 =====
subprocess.run(["python", "app.py"])
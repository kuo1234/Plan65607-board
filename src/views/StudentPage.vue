<template>
  <div class="home-button-container">
    <button @click="returnHome">返回主畫面</button>
    <button @click="listDevices">設備列表</button>
    <button @click="disconnectAllWifiDevices">斷開META眼鏡</button>
  </div>

  <div v-if="devices.length > 0" class="device-list">
    <div v-for="device in devices" :key="device" class="device-item">
      {{ device }}
      <div class="buttons-container">
        <!-- <button @click="getDeviceIP(device)">獲取設備IP</button>
        <button @click="setTCPIP(device)">設定TCP端口</button>
        <button @click="connectDevice(device)">設備連接</button> -->
        <!-- <button @click="wifiConnect(device)">眼鏡連接</button> -->

        <button @click="startScrcpy(device)">影像投射</button>
      </div>
      <div v-if="deviceIPs[device]">{{ deviceIPs[device] }}</div>


      <!-- 電腦端裁切預覽：抓 scrcpy 視窗並在這裡裁切顯示 -->
      <div class="preview-container">
        <!-- 來源 Video 隱藏，僅作為 WebGL 貼圖來源 -->
        <video 
          :ref="setVideoRef(device)" 
          autoplay muted playsinline 
          class="hidden-video"
          @play="(e) => initWebGLForDevice(device, e.target)"
        ></video>
        <!-- WebGL Canvas 負責渲染去畸變畫面 -->
        <canvas :ref="setCanvasRef(device)" class="gl-canvas"></canvas>
        
        <div class="controls">
          <label>反畸變強度: 
            <input type="range" min="-0.5" max="0.5" step="0.01" v-model="distortionK" />
            {{ distortionK }}
          </label>
           <label>縮放: 
            <input type="range" min="0.5" max="2.0" step="0.01" v-model="zoomScale" />
            {{ zoomScale }}
          </label>
          <label>移動X: 
            <input type="range" min="0.0" max="1.0" step="0.01" v-model="centerX" />
            {{ centerX }}
          </label>
          <label>移動Y: 
            <input type="range" min="0.0" max="1.0" step="0.01" v-model="centerY" />
            {{ centerY }}
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { toast } from "vue3-toastify";
import "vue3-toastify/dist/index.css";

const logAndSend = (msg) => {
  console.log(msg);
  if (window.electronAPI && window.electronAPI.send) {
    window.electronAPI.send('renderer-log', msg);
  }
};

const devices = ref([]);
const deviceIPs = ref({});
const videoRefs = ref({});
const canvasRefs = ref({});
const distortionK = ref(-0.15); // 預設反畸變參數
const zoomScale = ref(1.0);     // 預設縮放
const centerX = ref(0.5);       // X 軸中心偏移
const centerY = ref(0.5);       // Y 軸中心偏移
const animationFrames = {};     // 儲存每個裝置的動畫 ID 以便清除

const setVideoRef = (device) => (el) => {
  if (!el) return;
  videoRefs.value[device] = el;
};

const setCanvasRef = (device) => (el) => {
  if (!el) return;
  canvasRefs.value[device] = el;
};

// WebGL 初始化與渲染邏輯
const initWebGLForDevice = (device, videoEl) => {
  const canvas = canvasRefs.value[device];
  if (!canvas || !videoEl) return;

  const gl = canvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  // 設定 Canvas 解析度 (可依需求調整，這裡設為 720p 保持順暢)
  canvas.width = 1280;
  canvas.height = 720;

  // Vertex Shader
  const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  // Fragment Shader (反桶形畸變 + 單眼裁切 + 中心偏移)
  const fsSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform float u_k;
    uniform float u_scale;
    uniform vec2 u_center; // 新增：畸變中心點
    varying vec2 v_texCoord;

    void main() {
      // 1. 以設定的中心點為基準計算偏移 (預設 0.5, 0.5)
      vec2 uv = v_texCoord - u_center;
      
      // 2. 計算距離平方
      float r2 = dot(uv, uv);
      
      // 3. 畸變公式: new_r = r * (1 + k * r^2)
      // 反過來我們是從平整畫面映射回扭曲紋理
      float f = 1.0 + u_k * r2;
      
      // 4. 應用縮放與畸變修正，並加回中心點
      vec2 distortedUV = u_center + (uv * f) / u_scale;

      // 5. 邊界檢查 (超出不渲染)
      if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else {
        // 6. 僅取左眼 (紋理的左半部: x * 0.5)
        // scrcpy 輸出是並排雙眼，我們只顯示左邊那隻眼睛並拉平
        vec2 leftEyeUV = vec2(distortedUV.x * 0.5, distortedUV.y);
        gl_FragColor = texture2D(u_image, leftEyeUV);
      }
    }
  `;

  // 編譯 Shader
  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  // 設定頂點數據 (全螢幕 Quad)
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1,
  ]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  // WebGL 紋理坐標 (0,0) 在左下，影像通常左上，這裏視訊紋理通常不需要翻轉，直接 mapping
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 1,  1, 1,  0, 0,
    0, 0,  1, 1,  1, 0,
  ]), gl.STATIC_DRAW);

  const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // 建立紋理
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 設置紋理參數 (視訊串流需要 CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uKLoc = gl.getUniformLocation(program, "u_k");
  const uScaleLoc = gl.getUniformLocation(program, "u_scale");
  const uCenterLoc = gl.getUniformLocation(program, "u_center");

  // 渲染迴圈
  const render = () => {
    if (!videoEl || videoEl.paused || videoEl.ended) {
       animationFrames[device] = requestAnimationFrame(render);
       return;
    }

    // 更新紋理
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);

    // 繪製
    gl.uniform1f(uKLoc, parseFloat(distortionK.value));
    gl.uniform1f(uScaleLoc, parseFloat(zoomScale.value));
    gl.uniform2f(uCenterLoc, parseFloat(centerX.value), parseFloat(centerY.value));
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationFrames[device] = requestAnimationFrame(render);
  };

  render();
};

onUnmounted(() => {
  // 清理動畫 Loop
  Object.values(animationFrames).forEach(id => cancelAnimationFrame(id));
});

const deviceIPListeners = new Map(); // 創建一個新的 Map 來存儲監聽器
// 使用 window.electronAPI.listDevices 请求设备列表
const listDevices = () => {
  console.log("Requesting device list...");

  // 发送请求到主进程获取设备列表
  window.electronAPI.listDevices();

  // 监听设备列表返回
  window.electronAPI.on("device-list", (deviceList) => {
    if (!deviceList || deviceList.trim() === "List of devices attached") {
      // 设备列表为空，仅在控制台打印错误信息
      console.error("No devices connected");
    } else {
      console.log("Received device list from main process:", deviceList);

      // 处理设备列表字符串，将其分割成数组并更新设备列表
      devices.value = deviceList
        .split("\n")
        .filter(
          (line) =>
            line.includes("device") && !line.includes("List of devices attached")
        )
        .map((line) => line.trim().split(/\s+/)[0]);

      if (devices.value.length === 0) {
        console.error("No devices connected");
      } else {
        console.log("Parsed devices:", devices.value);
      }
    }
  });

  // 监听错误信息返回
  window.electronAPI.receive("device-list-error", (errorMessage) => {
    console.error("Error from main process:", errorMessage);

    if (errorMessage.includes("adb.exe not found")) {
      console.error("adb.exe not found at the expected path: " + adbPath);
    } else {
      console.error("Error while listing devices: " + errorMessage);
    }
  });
};


const getDeviceIP = (deviceName) => {
  return new Promise((resolve, reject) => {
    window.electronAPI.onDeviceIP(deviceName, (ip, error) => {
      if (error) {
        console.error(error);
        deviceIPs.value[deviceName] = "獲取IP失敗, 請連接到同個lan";
        reject(error);
      } else {
        deviceIPs.value[deviceName] = `${ip}:5555`;
        resolve(ip);
      }
    });
    window.electronAPI.getDeviceIP(deviceName);
  });
};

const setTCPIP = (deviceName) => {
  return new Promise((resolve, reject) => {
    window.electronAPI.setTcpip(deviceName);
    window.electronAPI.onSetTcpipResponse((response) => {
      if (response.success) {
        // alert(response.message);
        resolve(response);
      } else {
        console.error(response.message);
        reject(response.message);
      }
    });
  });
};

const connectDevice = (deviceName) => {
  const deviceAddress = deviceIPs.value[deviceName]; // 使用保存的IP地址和端口
  if (deviceAddress) {
    window.electronAPI.send("adb-connect", deviceAddress);
  } else {
    alert("設備IP未知，請先獲取設備IP");
  }
};

const wifiConnect = async (deviceName) => {
  try {
    await getDeviceIP(deviceName);
    await setTCPIP(deviceName);
    await connectDevice(deviceName);
    toast("成功連接眼鏡", {
      position: "top-center",
      autoClose: 2000,
    });
  } catch (error) {
    toast("連接失敗: " + error.message, {
      position: "top-center",
      type: "error",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
    });
  }
};

const startScrcpy = async (deviceId) => {
  // 這裡的 deviceId 是 adb devices 顯示的序號（USB 裝置 ID）
  logAndSend(`設備 ID: ${deviceId} - 準備啟動 scrcpy`);
  window.electronAPI.send("start-scrcpy", deviceId);

   // 稍微等待 scrcpy 視窗建立後，再從電腦端抓取並裁切
  setTimeout(() => {
    logAndSend(`[startScrcpy] 延遲後啟動 desktop crop...`);
    startDesktopCrop(deviceId);
  }, 1000);
};

const startDesktopCrop = async (deviceId, retryCount = 0) => {
  const videoEl = videoRefs.value[deviceId];
  if (!videoEl) {
    logAndSend(`[DesktopCrop] Error: Video Element not found for ${deviceId}`);
    return;
  }

  const windowTitle = `Quest3 - ${deviceId}`;
  logAndSend(`[DesktopCrop] Looking for window: "${windowTitle}" (Attempt ${retryCount + 1})`);

  try {
    const sourceId = await window.electronAPI.getWindowSourceId(windowTitle);
    
    if (!sourceId) {
      logAndSend(`[DesktopCrop] Window NOT found: "${windowTitle}"`);
      if (retryCount < 10) {
        logAndSend(`[DesktopCrop] Retrying in 1s...`);
        setTimeout(() => startDesktopCrop(deviceId, retryCount + 1), 1000);
      } else {
        logAndSend(`[DesktopCrop] Gave up looking for window.`);
      }
      return;
    }

    logAndSend(`[DesktopCrop] Found Window ID: ${sourceId}, starting capture...`);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        },
      },
    });
    
    logAndSend(`[DesktopCrop] Got stream, Video Tracks: ${stream.getVideoTracks().length}`);
    videoEl.srcObject = stream;
    videoEl.onloadedmetadata = () => {
      logAndSend(`[DesktopCrop] Video Metadata Loaded: ${videoEl.videoWidth}x${videoEl.videoHeight}`);
      videoEl.play();
    };
  } catch (err) {
    console.error(`[DesktopCrop] capture failed:`, err);
    logAndSend(`[DesktopCrop] Exception: ${err.message}`);
  }
};

const disconnectAllWifiDevices = () => {
  window.electronAPI.disconnectAllWifiDevices();
};

window.electronAPI.receive("scrcpy-response", (message) => {
  console.error(message); // 或將信息顯示在界面上
});
window.electronAPI.receive("adb-connect-response", (message) => {
  alert(message);
});

// 监听设备列表更新
window.electronAPI.on("device-list", (deviceList) => {
  // 处理设备列表字符串，将其分割成数组
  devices.value = deviceList
    .split("\n")
    .filter(
      (line) =>
        line.includes("device") && !line.includes("List of devices attached")
    )
    .map((line) => line.trim().split(/\s+/)[0]);
});

window.electronAPI.receive("adb-connect-response", (message) => {
  alert(message); // 或將信息顯示在界面上
});

const router = useRouter();
const returnHome = () => {
  router.push("/");
};
</script>

<style scoped>
.home-button-container {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  gap: 10px;
  display: flex;
  justify-content: start;
  gap: 10px;
  margin: 20px;
}

.home-button-container button {
  background-color: #4caf50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.home-button-container button:hover {
  background-color: #45a049;
}

.device-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
}

.device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
  border: 2px solid #4caf50;
  border-radius: 10px;
}

.device-name {
  font-size: 18px;
  font-weight: bold;
  color: #4caf50;
}

.buttons-container {
  display: flex;
  gap: 10px;
}

.buttons-container button {
  background-color: #4caf50;
  color: white;
  padding: 5px 15px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.buttons-container button:hover {
  background-color: #45a049;
}

.preview-container {
  margin-top: 10px;
  width: 1280px;  /* 與 Canvas 解析度一致，可隨意調整 */
  height: 720px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: #000;
  position: relative;
}

.hidden-video {
  /* 隱藏來源 video，只用來提供紋理 */
  /* display: none;  <-- 不使用 display: none，避免瀏覽器停止解碼/渲染 */
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}

.gl-canvas {
  width: 100%;
  height: 100%;
}

.controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 10px;
  display: flex;
  gap: 20px;
  justify-content: center;
}
</style>

<template>
  <div class="home-button-container">
    <button @click="returnHome">返回主畫面</button>
    <button @click="listDevices">設備列表</button>
    <button @click="disconnectAllWifiDevices">斷開所有WIFI設備</button>
  </div>

  <div v-if="devices.length > 0" class="device-list">
    <div v-for="device in devices" :key="device" class="device-item">
      {{ device }}
      <div class="buttons-container">
        <!-- <button @click="getDeviceIP(device)">獲取設備IP</button>
        <button @click="setTCPIP(device)">設定TCP端口</button>
        <button @click="connectDevice(device)">設備連接</button> -->
        <button @click="wifiConnect(device)">WiFi連接</button>

        <button @click="startScrcpy(device)">影像投射</button>
      </div>
      <div v-if="deviceIPs[device]">{{ deviceIPs[device] }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';


const devices = ref([]);
const deviceIPs = ref({}); 


const deviceIPListeners = new Map(); // 創建一個新的 Map 來存儲監聽器
// 使用 window.electronAPI.listDevices 请求设备列表
const listDevices = () => {
  window.electronAPI.listDevices();
};

const getDeviceIP = (deviceName) => {
  return new Promise((resolve, reject) => {
    window.electronAPI.onDeviceIP(deviceName, (ip, error) => {
      if (error) {
        console.error(error);
        deviceIPs.value[deviceName] = '獲取IP失敗, 請連接wifi';
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
        alert(response.message);
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
    window.electronAPI.send('adb-connect', deviceAddress);
  } else {
    alert('設備IP未知，請先獲取設備IP');
  }
};

const wifiConnect = async (deviceName) => {
  await getDeviceIP(deviceName);
  await setTCPIP(deviceName);
  connectDevice(deviceName); // 这里不需要await，因为`connectDevice`方法内部没有返回Promise
};

const startScrcpy = (deviceIP) => {
  // 確保 deviceIP 和 devicePort 是有效的值
  console.log(`設備 IP: ${deviceIP}`);
  window.electronAPI.send('start-scrcpy', deviceIP);
};

const disconnectAllWifiDevices = () => {
  window.electronAPI.disconnectAllWifiDevices();
};


window.electronAPI.receive('scrcpy-response', (message) => {
  alert(message); // 或將信息顯示在界面上
});
window.electronAPI.receive('adb-connect-response', (message) => {
  alert(message);
});


// 监听设备列表更新
window.electronAPI.on('device-list', (deviceList) => {
  // 处理设备列表字符串，将其分割成数组
  devices.value = deviceList.split('\n')
    .filter(line => line.includes('device') && !line.includes('List of devices attached'))
    .map(line => line.trim().split(/\s+/)[0]);
});

window.electronAPI.receive('adb-connect-response', (message) => {
  alert(message); // 或將信息顯示在界面上
});



const router = useRouter();
const returnHome = () => {
  router.push('/');
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
  background-color: #4CAF50;
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
  border: 2px solid #4CAF50;
  border-radius: 10px;
}

.device-name {
  font-size: 18px;
  font-weight: bold;
  color: #4CAF50;
}

.buttons-container {
  display: flex;
  gap: 10px;
}

.buttons-container button {
  background-color: #4CAF50;
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
</style>
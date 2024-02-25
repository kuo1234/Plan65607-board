<template>
    <div class="home-button-container">
      <button @click="return_home">Return Home</button>
      <button @click="startScrcpy">Start Scrcpy</button>
      <button @click="listDevices">裝置</button>
    </div>
    <div class="video-container">
      <div class="video-stream" v-for="n in 5" :key="n">
        <video controls>
          <source src="http://www.w3school.com.cn/i/movie.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <div class="heart-rate">心律: 未知</div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { onMounted } from 'vue';
  import { useRouter } from 'vue-router';
  
  // 如果使用 TypeScript，可能需要添加这个声明
  declare global {
    interface Window {
      electronAPI: {
        startScrcpy: () => void;
        on: (channel: string, callback: (data: any) => void) => void;
      }
    }
  }
  
  const router = useRouter();
  
  const return_home = () => {
    router.push('/');
  }
  
  const startScrcpy = () => {
    window.electronAPI.startScrcpy(); // 调用预加载脚本中暴露的方法
  }
  
  // 使用 onMounted 生命周期钩子来监听来自主进程的消息
  onMounted(() => {
    window.electronAPI.on('main-process-message', (message) => {
      console.log('Received message from main process:', message);
    });
  });
  </script>
  
  <style scoped>
  .home-button-container {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 10;
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
  
  .video-container {
    padding-top: 70px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  
  .video-stream {
    flex: 1 0 45%;
    aspect-ratio: 16 / 9;
    border: 2px solid red;
    max-width: 45%;
    position: relative;
  }
  
  .video-stream video {
    width: 100%;
    height: auto;
  }
  
  .heart-rate {
    position: absolute;
    bottom: 5px;
    left: 5px;
    background-color: rgba(0, 0, 0, 0.5);
    color: #fff;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 12px;
  }
  
  @media (min-width: 1024px) {
    .video-stream {
      flex: 1 0 30%;
      max-width: 30%;
    }
  
    .video-stream:nth-child(1),
    .video-stream:nth-child(2) {
      flex: 1 0 48%;
      max-width: 48%;
    }
  }
  </style>
  
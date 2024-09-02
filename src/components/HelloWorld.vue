<script setup lang="ts">
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import { useRouter } from 'vue-router';

import { exec } from 'child_process';
import { ipcRenderer } from 'electron';

interface ElectronAPI {
  editCommand: () => Promise<string>;
  on: (channel: string, func: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const router = useRouter();

const notify = () => {
      toast("OK !", {
      }); // ToastOptions
    }

    const editCommand = async () => {
  try {
    const message = await window.electronAPI.editCommand();
    toast(message, { type: 'success' });
  } catch (error) {
    let errorMessage = 'An unknown error occurred';
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    toast(errorMessage, { type: 'error' });
  }
}



const viewBiosignals = () => {
  router.push('/biosignal-page');
}

const viewSignals = () => {
  console.log('viewSignals')
}



const viewStudent = () => {
  router.push('/student-page'); 
}

</script>






<template>
  <div class="button-grid">
    <div class="button-row">
      <button @click="editCommand">技令編輯</button>
      <button @click="viewBiosignals">生理訊號</button>
    </div>
    <div class="button-row">
      <button @click="viewSignals">教學統計與列印</button>
      <button @click="viewStudent">學員畫面</button>
    </div>
  </div>
</template>

<style scoped>

.button-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-image: url("../assets/image3.png"); 
  background-size: cover; 
  min-height: 90vh;
  min-width: 120vh; 
}


.button-row {
  display: flex;
}

button {
  margin: 5px; 
  width: 200px; 
  height: 200px; 
  background-color: rgba(0, 0, 0, 0.5);;
  color: white;
  border: none; 
  font-size: 25px; 

}

</style>

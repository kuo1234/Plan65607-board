<script setup lang="ts">
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import { useRouter } from 'vue-router';

const router = useRouter();

const notify = () => {
      toast("OK !", {
      }); // ToastOptions
    }

    const editCommand = async () => {
  try {
    const message = await window.electronAPI.invoke('edit-command');
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

const viewExamHistory = () => {
  router.push('/exam-history');
}

const viewSettings = () => {
  router.push('/settings');
}

</script>






<template>
  <div class="button-grid">
    <button class="settings-mini-btn" @click="viewSettings">設定</button>
    <div class="button-row">
      <button @click="editCommand">技令編輯</button>
      <button @click="viewBiosignals">生理訊號</button>
    </div>
    <div class="button-row">
      <button @click="viewExamHistory">作答生理分析</button>
      <button @click="viewStudent">學員畫面</button>
    </div>
  </div>
</template>

<style scoped>

.button-grid {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-image: url("../assets/image3.png"); 
  background-size: cover; 
  min-height: 90vh;
  min-width: 120vh; 
}

.settings-mini-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  width: auto;
  height: auto;
  padding: 8px 14px;
  font-size: 14px;
  background-color: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.35);
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

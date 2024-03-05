<script setup lang="ts">
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import { useRouter } from 'vue-router';

const router = useRouter();

const notify = () => {
      toast("Wow so easy !", {
      }); // ToastOptions
    }


const editCommand = () => {
  console.log('editCommnad')
}



const viewSignals = () => {
  console.log('viewSignals')
}



const viewStudent = () => {
  router.push('/student-page'); // 使用路由的路径来导航
}

</script>






<template>
  <div class="button-grid">
    <div class="button-row">
      <button @click="editCommand">技令編輯</button>
      <button @click="notify">生理訊號</button>
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
  background-image: url("../assets/image1.png"); 
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

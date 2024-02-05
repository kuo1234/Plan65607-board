<template>
    <button @click = "return_home">主目錄 </button>
    <div class="video-container">
      <div class="video-stream" v-for="n in 5" :key="n">
        <video controls>
          <source src="http://www.w3school.com.cn/i/movie.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
</template>
  



<script setup lang="ts">
    import { ref } from 'vue'
    import { useRouter } from 'vue-router';

    const router = useRouter();
    const return_home = () => {
        router.push('/'); 
    }

</script>
  
  


<style scoped>
  .video-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-around;
  }
  .video-stream {
    width: 200px; 
    height: 150px;
    margin: 10px;
  }
</style>
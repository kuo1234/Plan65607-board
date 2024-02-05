<template>
<button @click="changeview(2)">顯示當向綁定</button>
<button @click="changeview(1)">顯示雙向綁定</button>
<button @click="changeview(3)">???</button>

    <div class="container1" v-show="view==1">
        <p>資料綁定(單向)</p>
        <p>{{data}}</p>
    </div>

    <div>
        
        <p v-for="(key,value,index) in list1">
            <span v-show="index!==3">
                {{ index }} ,  {{ key }}: {{ value }}
            </span>
        </p>    
            
    </div>


    <div class="container2" v-if="view==2">
        <p>資料綁定(雙向)</p>

        <input type= "text" v-model="text1" />

        <p>{{text1}}</p>
    </div>

    <div v-if="view!=2 && view!=1">
        <p>???</p>
    </div>




</template>




<script setup>    
    import { ref } from 'vue'
    const data = 'JUOIJOJOIIO  E'
    const text1 = ref('321')

    const list1 = {
        key: 'hello',
        key2: 'ni',
        key3: 'hao',
        key4: 'ma' 
    }


    const view = ref('2')
    const changeview = (index) => {
        view.value = index
        if (index == 1) {
            view.value=2
        } else if (index == 2) {
            view.value=1
        }
    }





</script>




<style>
.container1 {
    background-color: #121212; /* 深色背景 */
    color: #e0e0e0; /* 淺色文字 */
    display: flex;
    align-items: center;
    border: 2px solid red;
    justify-content: center;




}


.container2 {
    background-color: #121212; /* 深色背景 */
    color: #e0e0e0; /* 淺色文字 */
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid blue;
}



</style>


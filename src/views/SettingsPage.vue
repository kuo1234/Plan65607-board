<template>
  <div class="settings-page">
    <div class="panel">
      <h2>資料庫設定</h2>
      <p class="hint">設定會套用到 `plan65607` 與 `technical_order_editor_db`。</p>

      <label>資料庫 IP</label>
      <input v-model="form.ip" placeholder="例如: 192.168.50.72" />

      <label>帳號</label>
      <input v-model="form.username" placeholder="例如: root" />

      <label>密碼</label>
      <input v-model="form.password" type="password" placeholder="請輸入密碼" />

      <div class="actions">
        <button @click="$router.push('/')">返回首頁</button>
        <button class="save-btn" :disabled="saving" @click="saveConfig">
          {{ saving ? '儲存中...' : '儲存並重新連線' }}
        </button>
      </div>

      <p v-if="message" class="message">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

type DbConfig = {
  ip: string;
  username: string;
  password: string;
};

const form = reactive<DbConfig>({
  ip: '',
  username: '',
  password: '',
});

const saving = ref(false);
const message = ref('');
const error = ref('');

const loadConfig = async () => {
  message.value = '';
  error.value = '';
  try {
    const current = await electronApi.getDbConfig();
    form.ip = current.ip || '';
    form.username = current.username || '';
    form.password = current.password || '';
  } catch (err: any) {
    error.value = `讀取設定失敗: ${err?.message || err}`;
  }
};

const saveConfig = async () => {
  message.value = '';
  error.value = '';
  saving.value = true;

  try {
    const result = await electronApi.saveDbConfig({
      ip: form.ip.trim(),
      username: form.username.trim(),
      password: form.password,
    });

    if (result?.success) {
      message.value = result.message || '儲存成功';
    } else {
      error.value = result?.message || '儲存失敗';
    }
  } catch (err: any) {
    error.value = `儲存失敗: ${err?.message || err}`;
  } finally {
    saving.value = false;
  }
};

onMounted(loadConfig);

const electronApi = window.electronAPI as any;
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.panel {
  width: 100%;
  max-width: 520px;
  background: #1f1f1f;
  border: 1px solid #303030;
  border-radius: 10px;
  padding: 20px;
  box-sizing: border-box;
}

h2 {
  margin: 0 0 8px;
}

.hint {
  margin: 0 0 16px;
  color: #9aa0a6;
  font-size: 0.9rem;
}

label {
  display: block;
  margin: 12px 0 6px;
  font-weight: 600;
}

input {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #4a4a4a;
  background: #121212;
  color: #f1f1f1;
  box-sizing: border-box;
}

.actions {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}

button {
  border: none;
  border-radius: 6px;
  padding: 10px 14px;
  cursor: pointer;
  background: #445266;
  color: #fff;
}

.save-btn {
  background: #1565c0;
}

.save-btn:hover {
  background: #0d47a1;
}

.message {
  color: #81c784;
  margin-top: 10px;
}

.error {
  color: #e57373;
  margin-top: 10px;
}
</style>

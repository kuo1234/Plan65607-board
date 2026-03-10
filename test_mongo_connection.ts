import mongoose from 'mongoose';

const uri = 'mongodb://root:uscc65607@192.168.50.72:27017/plan65607?authSource=admin&directConnection=true';

async function testConnection() {
  try {
    console.log('嘗試連線至 MongoDB (plan65607)...');
    await mongoose.connect(uri);
    console.log('成功連線！\n');

    // 列出所有 collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('plan65607 資料庫中的 collections:');
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`  - ${col.name} (${count} 筆)`);
    }

    // 嘗試從 sensordatas 撈資料
    console.log('\n--- sensordatas collection ---');
    const allDocs = await mongoose.connection.db.collection('sensordatas').find({}).limit(5).toArray();
    console.log(`sensordatas 前 5 筆資料:`);
    for (const doc of allDocs) {
      console.log(`  uid="${doc.uid}", timestamp=${doc.timestamp}`);
    }
    
    // 列出所有不重複的 uid
    const uids = await mongoose.connection.db.collection('sensordatas').distinct('uid');
    console.log('\n所有不同的 uid 值:', uids);

  } catch (error) {
    console.error('連線或查詢失敗：', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n已斷開連線。');
  }
}

testConnection();
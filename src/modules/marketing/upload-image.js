// 与原上传请求保持相同 URL、Content-Type 和原始文件体；只增加浏览器上传进度。
export function uploadImage(id, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/materials/${id}/images?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); }
      catch { reject(new Error("图片上传返回无效内容，请刷新核对")); return; }
      if (xhr.status < 200 || xhr.status >= 300) reject(new Error(data?.error || "图片上传失败"));
      else resolve(data);
    };
    xhr.onerror = () => reject(new Error("图片上传连接中断"));
    xhr.onabort = () => reject(new Error("图片上传已中断"));
    xhr.ontimeout = () => reject(new Error("图片上传超时"));
    xhr.send(file);
  });
}

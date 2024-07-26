<script>
  export let label = 'Upload File';
  export let multiple = false;
  export let accept = '*';
  export let onFileSelect;

  let fileInput;
  let dragover = false;
  let fileCount = 0;

  function handleFileSelect(event) {
    const files = event.target.files || event.dataTransfer.files;
    fileCount = files.length;
    if (onFileSelect) onFileSelect(files);
  }

  function handleDragOver(event) {
    event.preventDefault();
    dragover = true;
  }

  function handleDragLeave() {
    dragover = false;
  }

  function handleDrop(event) {
    event.preventDefault();
    dragover = false;
    handleFileSelect(event);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  }
</script>

<div 
  class="file-upload" 
  class:dragover 
  on:click={() => fileInput.click()}
  on:keydown={handleKeyDown}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  role="button"
  tabindex="0"
  aria-label={label}
>
  <input
    bind:this={fileInput}
    type="file"
    {multiple}
    {accept}
    on:change={handleFileSelect}
    style="display: none;"
    aria-hidden="true"
  />
  <div class="upload-icon" aria-hidden="true">📁</div>
  <p class="label">{label}</p>
  {#if fileCount > 0}
    <p class="file-count" aria-live="polite">{fileCount} file{fileCount > 1 ? 's' : ''} selected</p>
  {/if}
</div>

<style>
  .file-upload {
    border: 2px dashed #aaa;
    border-radius: 8px;
    padding: 8px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.8em;
    width: 100%;
    max-width: 200px;
    margin: 0 auto;
  }

  .file-upload:hover, .file-upload:focus, .file-upload.dragover {
    border-color: #4CAF50;
    background-color: rgba(76, 175, 80, 0.1);
    outline: none;
  }

  .upload-icon {
    font-size: 1.2em;
    margin-bottom: 2px;
  }

  .label {
    margin: 2px 0;
  }

  .file-count {
    font-size: 0.8em;
    color: #4CAF50;
    margin-top: 2px;
  }
</style>
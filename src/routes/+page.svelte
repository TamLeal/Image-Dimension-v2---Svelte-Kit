<script>
  import { onMount } from 'svelte';
  import { writable, derived, get } from 'svelte/store';
  import FileUpload from '$lib/FileUpload.svelte';
  import { slide } from 'svelte/transition';

  const sampleFiles = writable([]);
  const manufacturerFiles = writable([]);
  const results = writable({});
  const pendingPairs = writable(new Set());
  const showSidebar = writable(true);

  let cv; // Variável global para o OpenCV

  onMount(() => {
    // Carregar o OpenCV.js
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.5.2/opencv.js';
    script.async = true;
    script.onload = () => {
      cv = window.cv;
      console.log('OpenCV.js carregado com sucesso');
    };
    document.body.appendChild(script);
  });

  function handleSampleUpload(files) {
    sampleFiles.set(Array.from(files));
    pendingPairs.set(new Set());
  }

  function handleManufacturerUpload(files) {
    manufacturerFiles.set(Array.from(files));
    pendingPairs.set(new Set());
  }

  async function processImages() {
    if (!cv) {
      console.error('OpenCV.js ainda não foi carregado');
      return;
    }

    const $sampleFiles = get(sampleFiles);
    const $manufacturerFiles = get(manufacturerFiles);
    const $pendingPairs = get(pendingPairs);

    for (let i = 0; i < Math.min($sampleFiles.length, $manufacturerFiles.length); i++) {
      if ($pendingPairs.has(i)) {
        try {
          const sampleImage = await loadImage($sampleFiles[i]);
          const manufacturerImage = await loadImage($manufacturerFiles[i]);

          const sampleMat = await convertToMat(sampleImage);
          const manufacturerMat = await convertToMat(manufacturerImage);

          const result = await processImagePair(sampleMat, manufacturerMat);
          results.update(r => ({
            ...r,
            [i]: {
              sampleImage: $sampleFiles[i],
              manufacturerImage: $manufacturerFiles[i],
              scale: result.scale_inches_per_pixel,
              width: result.width,
              height: result.height,
              img_with_coin: result.img_with_coin,
              img_matches: result.img_matches
            }
          }));

          // Liberar memória
          sampleMat.delete();
          manufacturerMat.delete();
        } catch (error) {
          console.error(`Erro ao processar o par ${i + 1}:`, error);
        }

        pendingPairs.update(pairs => {
          const newPairs = new Set(pairs);
          newPairs.delete(i);
          return newPairs;
        });
      }
    }
  }

  async function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function convertToMat(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    return cv.imread(canvas);
  }

  function preprocessImage(image, for_coin_detection = false) {
    const gray = new cv.Mat();
    cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);
    if (!for_coin_detection) {
      const equ = new cv.Mat();
      cv.equalizeHist(gray, equ);
      const blurred = new cv.Mat();
      cv.GaussianBlur(equ, blurred, new cv.Size(5, 5), 0);
      const edges = new cv.Mat();
      cv.Canny(blurred, edges, 50, 150);
      equ.delete();
      blurred.delete();
      return edges;
    }
    return gray;
  }

  function detectCoinAndScale(image, coin_diameter_inch = 0.955) {
    const gray = preprocessImage(image, true);
    const thresh = new cv.Mat();
    cv.threshold(gray, thresh, 240, 255, cv.THRESH_BINARY_INV);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    let coin_contour;
    let scale_inches_per_pixel = null;
    let mask = null;
    let img_with_coin = null;

    if (contours.size() > 1) {
      coin_contour = contours.get(1);
      const circle = cv.minEnclosingCircle(coin_contour);
      const radius = circle.radius;
      const diameter_pixels = radius * 2;
      scale_inches_per_pixel = coin_diameter_inch / diameter_pixels;
      mask = new cv.Mat.zeros(image.rows, image.cols, cv.CV_8UC1);
      cv.circle(mask, circle.center, radius, new cv.Scalar(255, 255, 255), -1);
      img_with_coin = image.clone();
      cv.circle(img_with_coin, circle.center, radius, new cv.Scalar(0, 255, 0), 2);
    }

    // Liberar memória
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();

    return { scale_inches_per_pixel, mask, img_with_coin };
  }

  async function processImagePair(sampleMat, manufacturerMat) {
    const { scale_inches_per_pixel, mask, img_with_coin } = detectCoinAndScale(sampleMat);
    if (!scale_inches_per_pixel) {
      throw new Error('Nenhuma moeda detectada');
    }

    const akaze = new cv.AKAZE();
    const kp1 = new cv.KeyPointVector();
    const kp2 = new cv.KeyPointVector();
    const des1 = new cv.Mat();
    const des2 = new cv.Mat();

    const sample_gray = new cv.Mat();
    const manufacturer_gray = new cv.Mat();
    cv.cvtColor(sampleMat, sample_gray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(manufacturerMat, manufacturer_gray, cv.COLOR_RGBA2GRAY);

    akaze.detectAndCompute(sample_gray, mask, kp1, des1);
    akaze.detectAndCompute(manufacturer_gray, new cv.Mat(), kp2, des2);

    const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matches = new cv.DMatchVector();
    bf.match(des1, des2, matches);

    console.log(`Total de correspondências encontradas: ${matches.size()}`);
    if (matches.size() < 10) {
      console.error(`Não há correspondências suficientes: ${matches.size()}`);
      throw new Error('Não foi possível encontrar correspondências suficientes entre as imagens.');
    }

    const img_matches = new cv.Mat();
    cv.drawMatches(sampleMat, kp1, manufacturerMat, kp2, matches, img_matches);

    const dimensions = calculateRealDimensions(matches, kp1, kp2, scale_inches_per_pixel, manufacturerMat);

    // Liberar memória
    sample_gray.delete();
    manufacturer_gray.delete();
    des1.delete();
    des2.delete();
    kp1.delete();
    kp2.delete();
    matches.delete();

    return {
      scale_inches_per_pixel,
      width: dimensions.width,
      height: dimensions.height,
      img_with_coin: cv.imencode('.jpg', img_with_coin).buffer,
      img_matches: cv.imencode('.jpg', img_matches).buffer
    };
  }

  function calculateRealDimensions(matches, kp1, kp2, scale_inches_per_pixel, manufacturerImage) {
    if (matches.size() > 0) {
      const distances_sample = [];
      const distances_manufacturer = [];
      for (let i = 0; i < matches.size(); i++) {
        const m = matches.get(i);
        distances_sample.push(cv.norm(kp1.get(m.queryIdx).pt));
        distances_manufacturer.push(cv.norm(kp2.get(m.trainIdx).pt));
      }
      const min_distance = Math.min(...distances_sample) / Math.min(...distances_manufacturer);
      const max_distance = Math.max(...distances_sample) / Math.max(...distances_manufacturer);
      const scale = (min_distance + max_distance) / 2;
      const manufacturer_height = manufacturerImage.rows;
      const manufacturer_width = manufacturerImage.cols;
      return {
        width: manufacturer_width * scale_inches_per_pixel * scale,
        height: manufacturer_height * scale_inches_per_pixel * scale
      };
    }
    throw new Error('Não foi possível encontrar correspondências suficientes entre as imagens.');
  }

  function togglePair(index) {
    pendingPairs.update(pairs => {
      const newPairs = new Set(pairs);
      if (newPairs.has(index)) {
        newPairs.delete(index);
      } else {
        newPairs.add(index);
      }
      return newPairs;
    });
  }

  const bothUploadsCompleted = derived(
    [sampleFiles, manufacturerFiles],
    ([$sampleFiles, $manufacturerFiles]) => $sampleFiles.length > 0 && $manufacturerFiles.length > 0
  );

  const selectAll = derived(
    [bothUploadsCompleted, pendingPairs, manufacturerFiles],
    ([$bothUploadsCompleted, $pendingPairs, $manufacturerFiles]) => 
      $bothUploadsCompleted && $pendingPairs.size === $manufacturerFiles.length
  );

  function toggleAllPairs() {
    const $bothUploadsCompleted = get(bothUploadsCompleted);
    const $manufacturerFiles = get(manufacturerFiles);

    if (!$bothUploadsCompleted) return;

    pendingPairs.update(pairs => {
      if (pairs.size === $manufacturerFiles.length) {
        return new Set();
      } else {
        return new Set($manufacturerFiles.map((_, i) => i));
      }
    });
  }

  function toggleSidebar() {
    showSidebar.update(value => !value);
  }

  const thumbnailUrls = derived(
    manufacturerFiles,
    $manufacturerFiles => $manufacturerFiles.map(file => URL.createObjectURL(file))
  );
</script>


<div class="container">
  <div class="sidebar-container" class:collapsed={!$showSidebar}>
    {#if $showSidebar}
      <div class="sidebar" transition:slide={{ duration: 300, axis: 'x' }}>
        <section class="upload-section">
          <h2>Image Upload</h2>
          <FileUpload
            label="Upload Sample Images"
            multiple={true}
            accept="image/*"
            onFileSelect={handleSampleUpload}
          />
          <FileUpload
            label="Upload Manufacturer Images"
            multiple={true}
            accept="image/*"
            onFileSelect={handleManufacturerUpload}
          />
        </section>

        <section class="select-pairs">
          <h2>Select Pairs to Process</h2>
          {#if $bothUploadsCompleted}
            <label class="select-all-checkbox">
              <input type="checkbox" bind:checked={$selectAll} on:change={toggleAllPairs}>
              <span class="checkmark"></span>
              Select All Pairs
            </label>
            <div class="pair-list">
              {#each $manufacturerFiles as file, index}
                <label class="pair-item">
                  <input type="checkbox" checked={$pendingPairs.has(index)} on:change={() => togglePair(index)}>
                  <img src={$thumbnailUrls[index]} alt="Thumbnail" class="thumbnail" />
                  Pair {index + 1}
                </label>
              {/each}
            </div>
          {:else}
            <p>Upload both sample and manufacturer images to select pairs.</p>
          {/if}
        </section>

        <button class="fancy-button process-button" on:click={processImages}>Process Selected Pairs</button>
      </div>
    {/if}
    <button class="toggle-sidebar" on:click={toggleSidebar}>
      <span class="icon">{$showSidebar ? '◀' : '▶'}</span>
    </button>
  </div>

  <div class="main-content">
    {#each Object.entries($results) as [index, result]}
      <div class="processed-pair">
        <h3>Processed Pair {parseInt(index) + 1}</h3>
        <div class="image-container">
          <img src={`data:image/jpeg;base64,${result.img_with_coin}`} alt="Sample with Coin Detected" />
          <img src={`data:image/jpeg;base64,${result.img_matches}`} alt="Manufacturer with Matches" />
        </div>
        <div class="result-info">
          <p>Scale (inches/pixel): {result.scale}</p>
          <p>Width: {result.width} inches</p>
          <p>Length: {result.height} inches</p>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .container {
    display: flex;
    height: calc(100vh - 60px);
    overflow: hidden;
  }

  .sidebar-container {
    position: relative;
    width: 300px;
    transition: width 0.3s ease;
    margin-left: 0;
  }

  .sidebar-container.collapsed {
    width: 40px;
  }

  .sidebar {
    background-color: var(--surface-color);
    padding: 1rem;
    border-radius: 8px;
    overflow-y: auto;
    height: 100%;
    width: 300px;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    margin-left: 30px;
  }

  .upload-section, .select-pairs {
    margin-bottom: 1.5rem;
  }

  .upload-section > :global(*) {
    margin-bottom: 10px;
  }

  .pair-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .pair-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    font-size: 0.8em;
  }

  .thumbnail {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 4px;
  }

  .fancy-button {
    background-color: #808080;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.9em;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }

  .fancy-button:hover {
    background-color: #666666;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
  }

  .process-button {
    width: 100%;
    margin-top: 1rem;
  }

  .select-all-checkbox {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    cursor: pointer;
    font-size: 0.9em;
    user-select: none;
  }

  .select-all-checkbox input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .checkmark {
    position: relative;
    display: inline-block;
    height: 20px;
    width: 20px;
    background-color: #eee;
    border-radius: 4px;
    margin-right: 10px;
  }

  .select-all-checkbox:hover input ~ .checkmark {
    background-color: #ccc;
  }

  .select-all-checkbox input:checked ~ .checkmark {
    background-color: #4CAF50;
  }

  .select-all-checkbox .checkmark:after {
    content: "";
    position: absolute;
    display: none;
    left: 7px;
    top: 3px;
    width: 5px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .select-all-checkbox input:checked ~ .checkmark:after {
    display: block;
  }

  .toggle-sidebar {
    position: absolute;
    top: 10px;
    right: 5px;
    background-color: transparent;
    color: #808080;
    border: none;
    cursor: pointer;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    transition: background-color 0.3s ease;
  }

  .toggle-sidebar:hover {
    background-color: rgba(128, 128, 128, 0.2);
  }

  .processed-pair {
    background-color: var(--surface-color);
    padding: 1rem;
    margin-bottom: 2rem;
    border-radius: 8px;
  }

  .image-container {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .image-container img {
    max-width: 45%;
    height: auto;
  }

  .result-info {
    display: flex;
    justify-content: space-between;
  }

  .pair-list {
    scrollbar-width: thin;
    scrollbar-color: #444 #2c2c2c;
  }

  .pair-list::-webkit-scrollbar {
    width: 8px;
  }

  .pair-list::-webkit-scrollbar-track {
    background: #2c2c2c;
  }

  .pair-list::-webkit-scrollbar-thumb {
    background-color: #444;
    border-radius: 4px;
    border: 2px solid #2c2c2c;
  }

  .pair-list::-webkit-scrollbar-thumb:hover {
    background-color: #555;
  }
</style>

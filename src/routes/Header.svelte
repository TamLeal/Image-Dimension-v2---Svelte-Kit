<script>
  import { page } from '$app/stores';
</script>

<header>
  <nav>
    <ul>
      <li class:active={$page.url.pathname === '/'}>
        <a href="/">Home</a>
      </li>
      <li class:active={$page.url.pathname === '/about'}>
        <a href="/about">About</a>
      </li>
    </ul>
  </nav>
</header>

<style>
  header {
    background-color: #f0f0f0;
    padding: 1rem;
  }
  
  ul {
    list-style-type: none;
    padding: 0;
    display: flex;
    gap: 1rem;
  }
  
  .active {
    font-weight: bold;
  }
</style>
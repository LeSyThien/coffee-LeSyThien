export async function retry(fn, times = 3) {
  try {
    return await fn();
  } catch (error) {
    if (times <= 1) throw error;
    console.warn(`Retrying... attempts left: ${times - 1}`);
    return retry(fn, times - 1);
  }
}
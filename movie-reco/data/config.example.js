// 내 PC에서 Supabase에 붙여 볼 때: 이 파일을 config.js로 복사하고 값을 채움 (config.js는 git에 안 올라감)
// 값은 Supabase 프로젝트 → Project Settings → API. 키는 publishable(anon)만. secret(service_role) 키는 넣지 말 것
// 배포된 사이트의 config.js는 GitHub secret(SUPABASE_URL, SUPABASE_KEY)으로 자동으로 만들어짐
// config.js가 없으면 계정은 이 브라우저에만 저장됨
const SUPABASE_URL='https://프로젝트ID.supabase.co', SUPABASE_KEY='';

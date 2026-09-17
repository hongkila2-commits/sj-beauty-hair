/**
 * 사이트 전체가 참조하는 단일 데이터 소스.
 *
 * ▸ 값을 바꾸려면 이 파일만 고치면 모든 페이지에 반영된다.
 * ▸ 빈 문자열('')인 항목은 "아직 정보를 못 받은 자리"다. 값을 채우면
 *   해당 버튼·링크가 화면에 자동으로 나타나고, 비워두면 숨겨진다.
 */

export const BRAND = {
  nameKo: 'SJ뷰티헤어',
  nameEn: 'SJ BEAUTY HAIR',
  tagline: '대전의 오늘을 가장 먼저 입는 헤어',
  description:
    '2016년 둔산본점에서 시작해 대전 5개 지점으로 성장한 미용실 브랜드입니다. 최신 스타일과 트렌드를 반영한 시술, 그리고 꾸준한 교육으로 다져진 디자이너가 함께합니다.',
  instagram: 'https://www.instagram.com/sj_beautyhair/',
  instagramHandle: '@sj_beautyhair',
  email: 'a861130@naver.com',
  /** 지점 대표번호를 아직 못 받았다. 값을 넣으면 헤더·푸터에 전화 버튼이 생긴다. */
  phone: '',
  hours: { open: '10:00', close: '20:30', note: '연중무휴 (명절 휴무)' },
} as const;

export type Branch = {
  slug: string;
  name: string;
  address: string;
  openedAt: string;
  /** 지점 대표번호. 비워두면 전화 버튼이 숨겨진다. */
  phone: string;
  /** 네이버 예약 주소. 비워두면 예약 버튼이 숨겨진다. */
  naverBooking: string;
  /** 네이버 지도 장소 주소. 비워두면 주소 검색 링크로 대체된다. */
  naverMap: string;
  photo: string;
  isFlagship?: boolean;
};

/** PDF 기업소개서 4페이지 기준. 주소·오픈일은 확정 사실이다. */
export const BRANCHES: Branch[] = [
  {
    slug: 'dunsan',
    name: '둔산본점',
    address: '대전 서구 둔산남로 93 지안빌딩 2층',
    openedAt: '2016-06',
    phone: '',
    naverBooking: '',
    naverMap: '',
    photo: '/branches/dunsan.webp',
    isFlagship: true,
  },
  {
    slug: 'yuseong',
    name: '유성점',
    address: '대전 유성구 대학로 151번길 26 홍일빌딩 2층',
    openedAt: '2016-06',
    phone: '',
    naverBooking: '',
    naverMap: '',
    photo: '/branches/yuseong.webp',
  },
  {
    slug: 'lotte',
    name: '롯데점',
    address: '대전 서구 계룡로 599 한밭새마을금고사옥 2층',
    openedAt: '2018-02',
    phone: '',
    naverBooking: '',
    naverMap: '',
    photo: '/branches/lotte.webp',
  },
  {
    slug: 'bongmyeong',
    name: '봉명점',
    address: '대전 유성구 문화원로 94 래자미탐앤탐 2층',
    openedAt: '2022-10',
    phone: '',
    naverBooking: '',
    naverMap: '',
    photo: '/branches/bongmyeong.webp',
  },
  {
    slug: 'songchon',
    name: '송촌점',
    address: '대전 대덕구 계족산로 81번길 101 선우빌딩 2층',
    openedAt: '2022-02',
    phone: '',
    naverBooking: '',
    naverMap: '',
    photo: '/branches/songchon.webp',
  },
];

/** PDF 3페이지 회사 개요표. */
export const COMPANY = [
  { label: '회사명', value: 'SJ뷰티헤어' },
  { label: '사업영역', value: '미용실 프랜차이즈' },
  { label: '설립연월', value: '2016년 6월 · 1호 본점 개점' },
  { label: '지점 수', value: '5개 지점' },
  { label: '사원 수', value: '5개점 총 53명' },
] as const;

/** PDF 5페이지 교육과정. */
export const CURRICULUM = [
  { step: 'A', title: 'A 과정', subtitle: '살롱 베이직 교육' },
  { step: 'B', title: 'B 과정', subtitle: '살롱 어드밴스 교육 1' },
  { step: 'C', title: 'C 과정', subtitle: '살롱 어드밴스 교육 2' },
  { step: 'D', title: 'D 과정', subtitle: '살롱 크리에이티브 교육 1' },
  { step: 'JR', title: 'JUNIOR STYLIST', subtitle: '살롱 크리에이티브 교육 2' },
] as const;

/** PDF 6페이지 근무환경. */
export const WORKPLACE = [
  {
    label: '급여 / 시간',
    items: ['신입 200만원~', '3개월마다 승급 후 직급수당 지급', '주 5일 근무, 근무시간 10:00 ~ 20:30'],
  },
  {
    label: '직급체계',
    items: [
      '디자이너 : 스탭 → 디자이너 → 수석디자이너 → 실장 → 원장',
      '매니지먼트 : 매니저 → 팀장 → 실장 → 부점장 → 점장 → 본부장',
    ],
  },
  {
    label: '복지',
    items: ['명절 휴무 / 명절 상여금 지급', '여름휴가 / 월차 및 근속 연차 지급', '4대보험 / 퇴직금'],
  },
  {
    label: '업무지원',
    items: ['SNS(네이버/인스타/유튜브 등) 마케팅 지원', '상반기 우수지점 포상 / 하반기 직무 분야별 성과 우수 포상'],
  },
] as const;

export const NAV = [
  { href: '/about', label: '브랜드' },
  { href: '/branches', label: '지점안내' },
  { href: '/blog', label: '헤어칼럼' },
  { href: '/videos', label: '영상' },
  { href: '/contact', label: '문의' },
  { href: '/recruit', label: '채용' },
] as const;

/** 네이버 지도에서 지점을 찾는 링크. 등록된 장소 주소가 있으면 그것을 쓴다. */
export function mapUrl(branch: Branch): string {
  return branch.naverMap || `https://map.naver.com/p/search/${encodeURIComponent(branch.address)}`;
}

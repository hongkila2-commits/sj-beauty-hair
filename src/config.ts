/**
 * 사이트 전체가 참조하는 단일 데이터 소스.
 *
 * ▸ 자주 바뀌는 값(연락처·영업시간·지점 전화·예약 링크)은 이 파일이 아니라
 *   content/settings/*.json 에 있고, 관리자가 /admin 화면에서 직접 고친다.
 *   이 파일은 그 값을 읽어와 페이지가 쓰기 좋은 모양으로 합쳐줄 뿐이다.
 * ▸ 빈 문자열('')인 항목은 "아직 정보를 못 받은 자리"다. 값을 채우면
 *   해당 버튼·링크가 화면에 자동으로 나타나고, 비워두면 숨겨진다.
 */

import siteSettings from '../content/settings/site.json';
import branchSettings from '../content/settings/branches.json';
import homeSettings from '../content/settings/home.json';
import pageSettings from '../content/settings/pages.json';
import promotionSettings from '../content/settings/promotion.json';

/** 인스타그램 주소에서 표시용 아이디(@handle)를 뽑는다. 관리자가 두 번 입력하지 않도록. */
function instagramHandleOf(url: string): string {
  const handle = url.replace(/\/+$/, '').split('/').pop() ?? '';
  return handle ? `@${handle}` : '';
}

export const BRAND = {
  // 브랜드 정체성 — 거의 바뀌지 않으므로 코드에 둔다
  nameKo: 'SJ뷰티헤어',
  nameEn: 'SJ BEAUTY HAIR',
  // 아래는 전부 /admin → 사이트 설정 에서 바뀐다
  tagline: siteSettings.tagline,
  description: siteSettings.description,
  instagram: siteSettings.instagram,
  instagramHandle: instagramHandleOf(siteSettings.instagram),
  email: siteSettings.email,
  /** 비어 있으면 헤더·푸터의 전화 버튼이 숨겨진다. */
  phone: siteSettings.phone,
  /** 브랜드 대표 예약 링크. 지점 링크가 없을 때 히어로·팝업 버튼이 이걸 쓴다. */
  naverBooking: siteSettings.naverBooking,
  naverPlace: siteSettings.naverPlace,
  hours: {
    open: siteSettings.hoursOpen,
    close: siteSettings.hoursClose,
    note: siteSettings.hoursNote,
  },
};

/** 메인 화면 문구·사진. /admin → 사이트 설정 → 메인 화면 */
export const HOME = homeSettings;

/** 각 페이지 문구. /admin → 사이트 설정 → 페이지 문구 */
export const PAGES = pageSettings;

/** 띠배너·팝업. /admin → 사이트 설정 → 띠배너·팝업 */
export const PROMO = promotionSettings;

/**
 * 검색엔진 사이트 등록용 인증 코드.
 *
 * 네이버·구글에 홈페이지를 등록하려면 "이 사이트가 내 것"임을 증명해야 한다.
 * 각 사이트가 주는 코드를 아래에 붙여넣으면 전 페이지에 자동으로 심긴다.
 * 비워두면 해당 태그가 아예 출력되지 않는다.
 *
 *   네이버 : searchadvisor.naver.com → 웹마스터도구 → 사이트 등록
 *            → HTML 태그 방식 → content="..." 안의 값만 복사
 *   구글   : search.google.com/search-console → 속성 추가 → URL 접두어
 *            → HTML 태그 방식 → content="..." 안의 값만 복사
 */
export const VERIFICATION = {
  naver: '',
  google: '',
} as const;

/** 가격 한 줄. 금액은 '80,000원~', '상담 후 결정' 처럼 자유롭게 적을 수 있게 문자열로 둔다. */
export type PriceItem = {
  category: string;
  name: string;
  price: string;
};

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
  /** 네이버 플레이스 주소. 예약 전용 주소가 아직 없을 때 예약 버튼이 여기로 간다. */
  naverPlace: string;
  /** 끄면 지점 페이지에서 가격표가 통째로 사라진다. */
  showPrices: boolean;
  priceNote: string;
  prices: PriceItem[];
  photo: string;
  isFlagship?: boolean;
  /** 주소에서 그대로 뽑은 자치구. 지역 검색 노출에 쓴다. 예) '서구' */
  district: string;
  /** 주소의 도로명. 예) '둔산남로' */
  road: string;
};

/**
 * 지점의 '구조' 정보. PDF 기업소개서 4페이지 기준이며 주소·오픈일은 확정 사실이다.
 * 전화번호·예약 링크·지도 링크는 여기에 두지 않는다 — 아래에서 JSON 값으로 채운다.
 */
/** 관리자가 /admin 에서 채우는 항목들. 여기 목록과 아래 병합부가 짝을 이룬다. */
type EditableBranchFields = 'phone' | 'naverBooking' | 'naverMap' | 'naverPlace'
  | 'showPrices' | 'priceNote' | 'prices';

const BRANCH_BASE: Omit<Branch, EditableBranchFields>[] = [
  {
    slug: 'dunsan',
    name: '둔산본점',
    address: '대전 서구 둔산남로 93 지안빌딩 2층',
    openedAt: '2016-06',
    photo: '/branches/dunsan.webp',
    district: '서구',
    road: '둔산남로',
    isFlagship: true,
  },
  {
    slug: 'yuseong',
    name: '유성점',
    address: '대전 유성구 대학로 151번길 26 홍일빌딩 2층',
    openedAt: '2016-06',
    photo: '/branches/yuseong.webp',
    district: '유성구',
    road: '대학로',
  },
  {
    slug: 'lotte',
    name: '롯데점',
    address: '대전 서구 계룡로 599 한밭새마을금고사옥 2층',
    openedAt: '2018-02',
    photo: '/branches/lotte.webp',
    district: '서구',
    road: '계룡로',
  },
  {
    slug: 'bongmyeong',
    name: '봉명점',
    address: '대전 유성구 문화원로 94 래자미탐앤탐 2층',
    openedAt: '2022-10',
    photo: '/branches/bongmyeong.webp',
    district: '유성구',
    road: '문화원로',
  },
  {
    slug: 'songchon',
    name: '송촌점',
    address: '대전 대덕구 계족산로 81번길 101 선우빌딩 2층',
    openedAt: '2022-02',
    photo: '/branches/songchon.webp',
    district: '대덕구',
    road: '계족산로',
  },
];

/**
 * 구조 정보 + 관리자가 /admin 에서 입력한 값을 slug 로 짝지어 합친다.
 * JSON 에 해당 지점이 없거나 값이 비어 있으면 빈 문자열이 되고,
 * 그 경우 관련 버튼이 화면에서 자동으로 숨겨진다.
 */
const EDITABLE = new Map(branchSettings.branches.map((b) => [b.slug, b]));

export const BRANCHES: Branch[] = BRANCH_BASE.map((base) => {
  const edited = EDITABLE.get(base.slug);
  return {
    ...base,
    phone: edited?.phone ?? '',
    naverBooking: edited?.naverBooking ?? '',
    naverMap: edited?.naverMap ?? '',
    naverPlace: edited?.naverPlace ?? '',
    showPrices: edited?.showPrices ?? false,
    priceNote: edited?.priceNote ?? '',
    prices: edited?.prices ?? [],
  };
});

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
  { href: '/events', label: '이벤트' },
] as const;

/** 네이버 지도에서 지점을 찾는 링크. 등록된 장소 주소가 있으면 그것을 쓴다. */
export function mapUrl(branch: Branch): string {
  return branch.naverMap || `https://map.naver.com/p/search/${encodeURIComponent(branch.address)}`;
}

/**
 * 예약 버튼이 어디로 갈지, 뭐라고 쓸지 한 곳에서 정한다.
 *
 * 예약 전용 주소(naverBooking)가 가장 정확하지만 아직 없다.
 * 그동안은 네이버 플레이스로 보낸다 — 거기서 고객이 예약 버튼을 누를 수 있다.
 * 둘 다 없으면 버튼을 만들지 않고, 부르는 쪽에서 문의 수단으로 대체한다.
 *
 * branch 를 넘기지 않으면 브랜드 대표 링크를 본다.
 */
export function bookingLink(branch?: Branch): { href: string; label: string } | null {
  const direct = branch?.naverBooking || BRAND.naverBooking;
  if (direct) return { href: direct, label: '네이버 예약' };

  const place = branch?.naverPlace || BRAND.naverPlace;
  if (place) return { href: place, label: '네이버 예약·문의' };

  return null;
}

/** 평평한 가격 목록을 화면에 보여줄 순서대로 카테고리별로 묶는다. */
export function groupPrices(prices: PriceItem[]): { category: string; items: PriceItem[] }[] {
  const order = ['펌', '염색', '커트'];
  const groups = new Map<string, PriceItem[]>();

  for (const item of prices) {
    const key = item.category || '기타';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      // 지정한 순서를 먼저, 나머지는 입력한 순서대로 뒤에 붙인다.
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    })
    .map(([category, items]) => ({ category, items }));
}

/*
 * 图标素材库配置：以后只需编辑这个文件、上传图片，不用修改 HTML 或布局。
 * 完整中文说明：仓库根目录《添加分类与图标.md》。
 * reservedSlots 是额外显示的待添加空位，不是容量上限，设 0 可隐藏。
 * 本文件是公开静态资源，请勿填写密码、令牌或私人信息。
 */
window.GRAPHIC_CATALOG = {
  categories: [
    {
      id: 'brand',
      name: '品牌标志',
      description: '从简洁的形态开始，找到品牌的第一种表达。',
      reservedSlots: 2,
      icons: [
        { id: 'brand-minimal', name: '极简之美', src: 'assets/style-0.png', alt: '极简品牌图标示例', tags: ['极简', '标志'], featured: true },
        { id: 'brand-geometric', name: '几何秩序', src: 'assets/style-1.png', tags: ['几何', '标志'] },
        { id: 'brand-luxury', name: '轻奢线条', src: 'assets/style-5.png', tags: ['轻奢', '精致'] },
        { id: 'brand-tech', name: '未来科技', src: 'assets/style-7.png', tags: ['科技', '创新'] }
      ]
    },
    {
      id: 'creative',
      name: '创意插画',
      description: '色彩、笔触与角色，让每一个小图形都有自己的性格。',
      reservedSlots: 2,
      icons: [
        { id: 'creative-gradient', name: '色彩无界', src: 'assets/style-2.png', tags: ['渐变', '色彩'], featured: true },
        { id: 'creative-mascot', name: '品牌伙伴', src: 'assets/style-3.png', tags: ['吉祥物', '角色'] },
        { id: 'creative-drawn', name: '自由笔触', src: 'assets/style-4.png', tags: ['手绘', '自然'] },
        { id: 'creative-retro', name: '复古时光', src: 'assets/style-6.png', tags: ['复古'] },
        { id: 'creative-oriental', name: '东方意境', src: 'assets/style-8.png', tags: ['中国风', '东方'] },
        { id: 'creative-cute', name: '可爱日常', src: 'assets/style-9.png', tags: ['可爱', '圆润'] }
      ]
    },
    {
      id: 'your-next-category',
      name: '预留分类',
      description: '这里已经留好位置。改一个分类名，放入你的第一张图标。',
      reservedSlots: 4,
      icons: []
    }
  ]
};

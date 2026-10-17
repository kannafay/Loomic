// Translate built-in showcase content at the display boundary, including rows
// loaded from an existing database. Unrecognized custom content stays intact.
const EXAMPLE_COPY: Record<string, readonly [string, string]> = {
  "Design pixel-perfect web interface.": [
    "设计精致的网页界面",
    "为一家名为 Loomic 的家具店生成新粗野主义风格的落地页。以下是产品图片：",
  ],
  "Solve a complex math problem on the white board.": [
    "在白板上解答复杂数学题",
    "生成一张白板图片，展示一道大学本科难度的数学题及其解答过程。",
  ],
  "Make a classic superhero comic strip.": [
    "创作经典超级英雄漫画",
    "创作一页 20 世纪 70 年代风格的复古超级英雄连环漫画。使用经典手绘漫画风格、粗线条轮廓、鲜艳但略微褪色的配色，以及清晰可见的本戴网点。身穿标志性服装的神奇女侠与两名穿西装的男子出现在纽约城中，故事讲述她将他们从枯燥的朝九晚五办公室生活中解救出来。采用传统漫画分格布局，配有对话气泡和旁白框，营造怀旧、冒险且略带诙谐的复古氛围。",
  ],
  "Make your own wizard newspaper.": [
    "制作专属魔法报纸",
    "生成一张泛黄、复古、高清的《预言家日报》头版，准确还原《哈利·波特》电影中的标志性视觉风格。顶部用华丽的哥特式字体醒目呈现“THE DAILY PROPHET”。以经典、略带做旧感的衬线字体排出粗大醒目的标题：“BUTTERBEER FESTIVAL! AMOROUS CHOCOLATE!”。中央放置一张快乐的巫师举杯碰杯的黑白照片。",
  ],
  "Generate professional engineering drawings.": [
    "生成专业工程图纸",
    "为这个物体生成专业 CAD 工程图。采用等轴测视图，在高质量蓝色背景上绘制白色线条；线宽和线型遵循制图规范，并添加尺寸线和标注。",
  ],
  "Put your logo on everything.": [
    "让品牌标志融入各种产品",
    "拍摄一张鲜明活泼的照片：一只精心护理的女性手握着木棒上的香蕉形冰棍，冰棍呈亮黄色，表面光滑有光泽，背景是晴朗的夏日蓝天。主体在画面中大小适中，四周保留充足留白。指甲涂有与冰棍相配的黄色指甲油，冰棍上压印所提供的品牌标志。采用略微仰视的平视机位拍摄手和冰棍，使用强烈、直接、高对比度的阳光，形成清晰锐利的阴影，呈现大胆、有活力的平面视觉效果。",
  ],
  "Design a Bauhaus-inspired poster.": [
    "设计包豪斯风格海报",
    "为音乐节设计一张包豪斯风格海报。仅使用粉色、红色和奶油色，以抽象几何图形表现声波，并搭配极简的竖排文字。",
  ],
  "Design a ceramic dinnerware set.": [
    "设计成套陶瓷餐具",
    "生成 5 张陶瓷餐具图片，分别展示小碗、大碗、小盘、大盘和马克杯，每种各一件，组成风格统一的套装。融合北欧极简与日式侘寂美学，采用柔和的中性色、有机纹理、带有手工拉坯痕迹的不规则造型、细微釉色变化和自然光感。每件产品均使用无缝白色背景与均匀的棚拍产品灯光。",
  ],
  "Design new pieces for a jewelry collection.": [
    "为珠宝系列设计新款",
    "以提供的项链为基础，生成同系列耳环和戒指的白底产品照片，各一张。确保整套设计语言一致，保持适合奢侈品牌官网首页的统一视觉气质：简约、优雅、经典。",
  ],
  "Generate packaging design variations.": [
    "探索不同包装设计",
    "将产品包装改为黄瓜口味。",
  ],
  "Experiment with furniture design.": [
    "探索家具设计创意",
    "设计一把亮橙色丝绒材质、具有雕塑感的管状椅子。",
  ],
  "Brainstorm beautiful interiors.": [
    "构思理想的室内空间",
    "生成 5 种不同的室内空间，采用不同家具、颜色和空间布局，同时保持一致的风格与氛围。",
  ],
  "Generate logo options.": [
    "生成多种品牌标志方案",
    "为寿司店设计极简矢量卡通标志。采用简洁、粗实、圆润的线条，整体干净、现代且设计精良。",
  ],
  "Design branded merch for your coffee shop.": [
    "为咖啡店设计品牌周边",
    "拍摄一张极简产品照片：时尚且品质出众的陶瓷浓缩咖啡杯与碟子放在浅色木桌上，背景为干净的白墙，杯身印有所提供的黑色品牌标志。画面具有电影感与杂志大片气质，使用温暖、富有戏剧性的午后侧光，形成高对比度阴影。构图简洁自然，杯子清晰对焦，整体采用暖色调。",
  ],
  "Put your logo on a cap.": [
    "把品牌标志绣在帽子上",
    "生成浅蓝色帽子的棚拍产品照片，帽子正面绣有所提供的品牌标志。呈现真实、光线充足、简约的效果，使用中性背景。刺绣采用黑色线，平整且低调。",
  ],
  "Generate outdoor mockups for your design.": [
    "生成户外设计展示效果",
    "将提供的冰淇淋图片原样展示在街边立牌上，生成真实的户外展示效果。",
  ],
  "Emotional storytelling for your brand.": [
    "用画面讲述品牌情绪故事",
    "以一致的氛围和风格，为同一组杂志专题生成以下图片：精心护理的手调整耳环的特写；女性穿细高跟鞋迈出汽车的超近景；华丽弧形楼梯的建筑细节特写；未整理床铺的超近景；高级餐厅中精致甜点的特写。",
  ],
  "Make a stunning holiday campaign for your brand.": [
    "打造出彩的品牌节日大片",
    "为提供的珠宝拍摄俯视平铺产品照片。珠宝深深嵌入洁白的积雪中，紧密而自然。积雪不应只是平坦的底面，而应向上隆起并局部覆盖香蕉。雪面带有细小、略粗的冰晶，形成类似糖粉的立体颗粒质感。使用明亮的直射光突出雪的纯白，并以细微阴影展现复杂且不平整的表面纹理。",
  ],
  "From sketch to endless illustration styles.": [
    "将草图转化为多种插画风格",
    "将这张草图转化为二维插画，尝试 5 种不同风格。",
  ],
  "Turn your photo into an ink drawing.": [
    "把照片变成钢笔画",
    "将这张照片转化为细节丰富的钢笔画，使用细线条和蓝色墨水色调，绘制在浅灰色点阵笔记本页面上。保持原始宽高比。",
  ],
  "Make surrealist art.": [
    "创作超现实主义艺术",
    "使用这些物品生成一幅超现实主义绘画，可以自由组合并任意重复使用。",
  ],
  "Generate seamless patterns for your project.": [
    "为项目生成无缝图案",
    "生成 3 种细碎小花风格的无缝连续图案。",
  ],
  "Illustrate a photo in your signature style.": [
    "将照片转化为独特风格插画",
    "参考提供的绘画风格，为这个物品生成大胆、色彩鲜明的二维独立插画，背景使用活泼的桌布图案，并与参考画保持相同风格。",
  ],
  "Expand your illustration.": [
    "扩展插画画面",
    "扩展这张插画，将画面宽高比调整为 16:9。",
  ],
  "Show your clothing on a model.": [
    "让模特展示你的服装",
    "将她的上衣替换为提供的这件毛衣。",
  ],
  "Generate new angles for your clothing.": [
    "生成服装的不同展示角度",
    "展示模特的背面和侧面视图，保持原有摄影风格。",
  ],
  "Turn quick snapshots into polished product photos.": [
    "把随手拍变成专业产品照",
    "为提供的项链生成一组 5 张适合官网展示的高级珠宝时尚杂志大片。",
  ],
  "Style your product for social media.": [
    "为社交媒体打造产品场景",
    "为这个陶瓷盘生成 5 张简约、有创意、具有风格化生活气息的图片，宽高比均为 4:5。",
  ],
  "Show your product in a lifestyle scene.": [
    "在生活场景中展示产品",
    "将提供的沙发展示在干净、布置精致、舒适的现代北欧室内空间中，使用柔和日光和中性材质配色。",
  ],
  "Generate ad graphics for your product.": [
    "为产品生成广告海报",
    "为这款香水设计一张干净、极简、现代的广告海报。瓶身置于画面下半部分中央。背景采用平滑的垂直渐变，从底部浅黄色过渡至顶部柔和明亮的奶油黄。使用白色品牌标志，并在顶部以小号白色无衬线字体呈现：“20% Off Our Signature Scent”。",
  ],
  "Turn product photos into 360° videos.": [
    "把产品照片变成 360° 视频",
    "以提供的图片作为首帧和尾帧，生成戒指慢速旋转的视频。",
  ],
  "Turn static ads into scroll-stopping animations.": [
    "把静态广告变成吸睛动画",
    "让香水产品动起来，同时保持背景完全静止。",
  ],
  "Have your model walk.": ["让模特走起来", "让模特行走，镜头跟随她移动。"],
  "Generate shortform videos with Sora, sound on.": [
    "用 Sora 生成有声短视频",
    "为提供的产品制作竖屏短广告，强调生活方式与氛围，呈现带颗粒感的柯达胶片质感。蒙太奇展示极简家具细节、鲜花、黄油吐司早餐、透过窗帘的阳光，以及人物向空气中喷洒香水的镜头。搭配柔和的低保真音乐、低饱和暖色调与流畅无缝的剪辑。",
  ],
  "Generate professional animation with Veo, sound on.": [
    "用 Veo 生成专业有声动画",
    "使用提供的两个角色和森林场景，生成一段 8 秒动画。年轻公主在林间空地优雅旋转，与名叫 Finn 的俏皮森林精灵相遇。他们一起发现一朵发光的魔法花，闪烁的光点在周围盘旋升起。动画采用 20 世纪 30 年代迪士尼赛璐珞童话电影风格：动作圆润而富有表情，灯光温暖且有绘画感，手绘动画流畅，背景伴有柔和的管弦乐。声音与动作应呈现经典迪士尼公主动画的温柔、悦耳、温暖与奇妙氛围。",
  ],
  "Generate cinematic footage.": [
    "生成电影感镜头",
    "生成一段宽高比为 16:9 的视频：低机位拍摄跑车在沙漠中漂移，扬起的沙尘映照金色阳光。镜头使用长焦横向跟拍，远处热浪闪动。整体节奏快速、具有真实重量感和强烈动势。",
  ],
};

const DISCOVERY_COPY: Record<string, readonly [string, string]> = {
  "The ART & Cultural Arts Center": [
    "文化艺术中心品牌设计",
    "请以文化艺术中心为灵感，为我做一套品牌探索。输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案，整体气质要现代、文化感强、适合艺术活动传播。",
  ],
  "Vintage Car Poster": [
    "复古汽车海报",
    "围绕复古汽车主题，帮我设计一组海报。需要包含主海报、社交媒体方图版本和标题排版建议，整体风格偏复古、胶片感、适合活动宣传。",
  ],
  "Cat Tarot Cards": [
    "猫咪塔罗牌",
    "以猫咪塔罗牌为主题，帮我扩展一套插画系列。请给出角色设定、牌面视觉语言、配色建议和可延展的周边方向。",
  ],
  "Fallout-themed cake shop website.": [
    "末日废土风蛋糕店网站",
    "以末日废土风蛋糕店为灵感，帮我设计一个官网。输出首页信息架构、首屏视觉、商品卡片样式和核心配色建议。",
  ],
  "My Creepy Clown Avatar in Abandoned Circus Park": [
    "废弃马戏团中的诡异小丑",
    "围绕废弃马戏团中的诡异小丑，帮我做一套角色设计。包含角色设定、表情变化、服装元素和场景氛围建议。",
  ],
  "Mixtapes Emotions !": [
    "音乐混剪与情绪",
    "围绕音乐混剪与情绪，帮我做一组音乐情绪短片分镜。需要拆出镜头节奏、情绪转场、标题卡和视觉风格建议，适合做 15 到 30 秒的短视频。",
  ],
  "Product Visualization - Robot Hand": [
    "机械手产品视觉",
    "围绕机械手这个概念，帮我设计一组未来感产品视觉。请给出产品卖点表达、主视觉构图、材质方向和电商展示图思路。",
  ],
  "Building a new website and learning how to AI": [
    "用 AI 探索建筑工作室网站",
    "请运用 AI 设计思路，帮我设计一个面向建筑工作室的网站概念。输出网站结构、首页视觉、项目展示模块和整体建筑感风格建议。",
  ],
};

export function localizeHomeExample(title: string, prompt: string) {
  const copy = EXAMPLE_COPY[title];
  return copy ? { title: copy[0], prompt: copy[1] } : { title, prompt };
}

export function localizeHomeDiscovery(title: string, prompt: string) {
  const copy = DISCOVERY_COPY[title.trim()];
  return copy ? { title: copy[0], prompt: copy[1] } : { title, prompt };
}

const MENTION_LABELS: Record<string, string> = {
  Chair: "椅子",
  Nightstand: "床头柜",
  Beanbag: "懒人沙发",
  Table: "桌子",
  Stool: "凳子",
  Image: "图片",
  Logo: "标志",
  Necklace: "项链",
  Interior: "室内空间",
  Board: "立牌",
  Reference: "参考图",
  Earrings: "耳环",
  Cat: "猫咪",
  Spoon: "勺子",
  Umbrella: "雨伞",
  Egg: "鸡蛋",
  Cherry: "樱桃",
  Hat: "帽子",
  Box: "盒子",
  Bunny: "兔子",
  Avocado: "牛油果",
  Model: "模特",
  Sweater: "毛衣",
  "Front View": "正面视图",
  Ceramic: "陶瓷",
  Sofa: "沙发",
  Perfume: "香水",
  Ring: "戒指",
  Poster: "海报",
  "Princess Elara": "艾拉拉公主",
  "Forest Sprite": "森林精灵",
  "Forest Clearing": "林间空地",
};

export function localizeHomeInputMentions<
  T extends { type: string; name: string },
>(title: string, mentions: T[]): T[] {
  if (!EXAMPLE_COPY[title]) return mentions;
  return mentions.map((mention) =>
    mention.type === "image"
      ? { ...mention, name: MENTION_LABELS[mention.name] ?? mention.name }
      : mention,
  );
}

import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
dotenv.config();

const login = async () => {
    const browser = await puppeteer.launch({ 
        headless: false, 
        args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'], 
        dumpio: true 
    });
    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    await page.setViewport({ width: 1080, height: 1024 });
    await page.goto('https://blearning.hust.edu.vn/login/index.php', { waitUntil: 'networkidle2' });

    await page.type('#username', process.env.MOODLE_USERNAME, { delay: 50 });
    await page.type('#password', process.env.MOODLE_PASSWORD, { delay: 50 });

    await Promise.all([
        page.click('#loginbtn'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    if (page.url().includes('my/')) {
        console.log('✅ Đăng nhập thành công!');
    } else {
        console.log('❌ Đăng nhập thất bại.');
        await browser.close();
        return;
    }

    await page.goto('https://blearning.hust.edu.vn/my/courses.php', { waitUntil: 'networkidle2' });
    console.log(`✅ Đã chuyển đến: ${page.url()}`);

    const courseElement = await page.waitForSelector('::-p-xpath(//a[.//span[contains(text(),"Phân tích và thiết kế hệ thống")]])');
    await courseElement.click();

    const quizElement = await page.waitForSelector('::-p-xpath(//a[.//span[contains(text(),"PTest")]])');
    await quizElement.click();

    const buttonXPath = '//button[contains(text(),"Re-attempt quiz") or contains(text(),"Continue your attempt")]';
    const buttonElement = await page.waitForSelector(`::-p-xpath(${buttonXPath})`, { visible: true });
    await buttonElement.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const questionSelector = 'a.qnbutton.notyetanswered.free.btn, a.qnbutton.answersaved.free.btn';
    await page.waitForSelector(questionSelector);
    let questionLinks = await page.$$(questionSelector);
    console.log(`🔍 Đã tìm thấy ${questionLinks.length} câu hỏi`);

    for (let i = 0; i < questionLinks.length; i++) {
        console.log(`Click vào câu hỏi ${i + 1}...`);
        await questionLinks[i].click();
        await Promise.race([
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => console.log("⏳ Không có navigation!"))
        ]);
        await page.waitForSelector(questionSelector, { timeout: 5000 });
        questionLinks = await page.$$(questionSelector);

        // Tìm lại iframe (nếu có)
        let frames = await page.frames();
        let questionFrame = frames.find(frame => frame.url().includes("attempt.php"));

        if (!questionFrame) {
            console.log("🔴 Không tìm thấy frame chứa câu hỏi!");
            continue;
        }

    // Lấy lại danh sách phương án từ iframe
    let options = await questionFrame.$$('input[type="radio"], input[type="checkbox"]');

    if (!options || options.length === 0) {
        console.log("🔴 Không tìm thấy phương án nào trong câu hỏi này!");
        continue;
    }

    // Lọc các phương án thực sự hiển thị
    const visibleOptions = [];
    for (const option of options) {
        const isHidden = await option.evaluate(el => window.getComputedStyle(el).display === 'none' || el.offsetParent === null);
        if (!isHidden) {
            visibleOptions.push(option);
        }
    }

    console.log(`✅ Số phương án thực sự hiển thị: ${visibleOptions.length}`);
    
    if (visibleOptions.length > 0) {
        const isCheckbox = await visibleOptions[0].evaluate(el => el.type === 'checkbox');
        
        if (isCheckbox) {
            const numChoices = Math.floor(Math.random() * (visibleOptions.length + 1));
            const shuffledOptions = visibleOptions.sort(() => 0.5 - Math.random());
            const selectedOptions = shuffledOptions.slice(0, numChoices);
            
            console.log(`🟢 Đã chọn ${selectedOptions.length} phương án`);

            for (const option of selectedOptions) {
                await page.evaluate(el => el.click(), option);
            }
        } else {
            const randomIndex = Math.floor(Math.random() * visibleOptions.length);
            console.log(`🟢 Đã chọn phương án ${randomIndex + 1}`);
            await page.evaluate(el => el.click(), visibleOptions[randomIndex]);
        }
    }

    }

    const finishAttemptSelector = 'a.endtestlink.aalink';
    console.log("⏳ Đang tìm nút 'Finish attempt ...' ");
    await page.waitForSelector(finishAttemptSelector, { visible: true });
    await page.click(finishAttemptSelector);
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log("🎯 Đã hoàn thành bài kiểm tra!");

    const submitButtonSelector = 'button.btn.btn-primary[id^="single_button"]';
    console.log("⏳ Đang tìm nút 'Submit all and finish'...");
    await page.waitForSelector(submitButtonSelector, { visible: true });
    await page.click(submitButtonSelector);
    console.log("🎯 Summary bài kiểm tra!");

    const confirmButtonSelector = 'button.btn.btn-primary[data-action="save"]';
    console.log("⏳ Đang chờ nút xác nhận 'Submit all and finish' trong popup...");
    await page.waitForSelector(confirmButtonSelector, { visible: true });
    await page.click(confirmButtonSelector);
    console.log("✅ Đã nhấn xác nhận nộp bài trong popup!");
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    await browser.close();
};

login();
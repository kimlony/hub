package hub.news.controller;

import hub.crawl.CrawlScheduleControlService;
import hub.news.NewsSearchCondition;
import hub.news.service.NewsService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/news")
@RequiredArgsConstructor
public class NewsController {

    private final NewsService newsService;
    private final CrawlScheduleControlService crawlScheduleControlService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getNews(
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        NewsSearchCondition cond = new NewsSearchCondition();
        cond.setSource(source);
        cond.setKeyword(keyword);
        cond.setPage(Math.max(page, 1));
        cond.setSize(Math.min(Math.max(size, 1), 100));
        return ResponseEntity.ok(newsService.getNewsList(cond));
    }

    @GetMapping("/crawl-control")
    public ResponseEntity<Map<String, Object>> getCrawlControl() {
        return ResponseEntity.ok(Map.of("enabled", crawlScheduleControlService.isEnabled()));
    }

    @PatchMapping("/crawl-control")
    public ResponseEntity<Map<String, Object>> updateCrawlControl(
            @RequestBody CrawlControlRequest request
    ) {
        boolean enabled = crawlScheduleControlService.setEnabled(request.enabled());
        return ResponseEntity.ok(Map.of("enabled", enabled));
    }

    public record CrawlControlRequest(boolean enabled) {
    }
}

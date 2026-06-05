package com.bizbee.hub.news;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/hub/news")
@RequiredArgsConstructor
public class NewsController {

    private final NewsService newsService;

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
}

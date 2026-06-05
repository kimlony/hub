package com.bizbee.hub.news;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NewsServiceImpl implements NewsService {

    private final NewsMapper newsMapper;

    @Override
    public Map<String, Object> getNewsList(NewsSearchCondition cond) {
        int total = newsMapper.countList(cond);
        List<NewsResponse> list = newsMapper.findList(cond)
                .stream()
                .map(this::toResponse)
                .toList();

        return Map.of(
                "total", total,
                "list", list,
                "page", cond.getPage(),
                "size", cond.getSize()
        );
    }

    private NewsResponse toResponse(NewsRow row) {
        return NewsResponse.builder()
                .id(row.getId())
                .source(row.getSource())
                .category(row.getCategory())
                .title(row.getTitle())
                .summary(row.getSummary())
                .url(row.getUrl())
                .corpName(row.getCorpName())
                .publishedAt(row.getPublishedAt())
                .build();
    }
}
